/**
 * Safe MCP config parsing shared by the main-process store and the settings UI.
 *
 * Agent-installed connectors (Claude-style `mcpServers` maps, Tavily stdio
 * entries without `type`/`id`, string `args`, etc.) must never crash the
 * Settings → MCP Connectors tab.
 */
import type { McpServerConfig, McpServerStatus, McpTool } from './ipc-types';

export type McpTransportType = McpServerConfig['type'];

export interface NormalizeMcpConfigResult {
  servers: McpServerConfig[];
  repaired: boolean;
  source: 'servers' | 'mcpServers' | 'empty' | 'unknown';
  skipped: number;
  /** Present when a `servers` / `mcpServers` value could not be parsed. */
  error?: string;
}

export interface McpConnectorRenderFields {
  key: string;
  id: string;
  name: string;
  typeLabel: string;
  commandLine: string;
  url: string;
  enabled: boolean;
}

const VALID_TRANSPORTS = new Set<McpTransportType>(['stdio', 'sse', 'streamable-http']);

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function parseJsonIfString(value: unknown): unknown {
  if (typeof value !== 'string') {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return value;
  }
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return value;
  }
}

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug;
}

function nonEmptyString(value: unknown): string | undefined {
  if (typeof value !== 'string') {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
}

export function formatMcpArgsInput(args?: unknown): string {
  if (Array.isArray(args)) {
    return args.map((item) => String(item)).join(' ');
  }
  if (typeof args === 'string') {
    return args;
  }
  return '';
}

export function formatMcpCommandLine(command?: string, args?: unknown): string {
  const cmd = typeof command === 'string' ? command : '';
  return `${cmd} ${formatMcpArgsInput(args)}`.trim();
}

export function formatMcpTypeLabel(type: string | undefined): string {
  return (type && type.trim() ? type : 'stdio').toUpperCase();
}

function normalizeTransportType(
  raw: unknown,
  hasCommand: boolean,
  hasUrl: boolean
): { type: McpTransportType; repaired: boolean } {
  const asString = typeof raw === 'string' ? raw.trim().toLowerCase() : '';
  if (VALID_TRANSPORTS.has(asString as McpTransportType)) {
    return { type: asString as McpTransportType, repaired: false };
  }

  if (
    asString === 'http' ||
    asString === 'streamablehttp' ||
    asString === 'streamable_http' ||
    asString === 'streamable'
  ) {
    return { type: 'streamable-http', repaired: true };
  }

  if (hasUrl && !hasCommand) {
    return { type: asString === 'sse' ? 'sse' : 'streamable-http', repaired: true };
  }

  return { type: 'stdio', repaired: true };
}

function normalizeArgs(raw: unknown): { args?: string[]; repaired: boolean } {
  if (raw == null) {
    return { repaired: false };
  }
  if (Array.isArray(raw)) {
    return { args: raw.map((item) => String(item)), repaired: false };
  }
  if (typeof raw === 'string') {
    const trimmed = raw.trim();
    return { args: trimmed ? trimmed.split(/\s+/) : [], repaired: true };
  }
  return { repaired: true };
}

function normalizeStringRecord(raw: unknown): {
  record?: Record<string, string>;
  repaired: boolean;
} {
  if (raw == null) {
    return { repaired: false };
  }
  if (Array.isArray(raw)) {
    const record: Record<string, string> = {};
    for (const item of raw) {
      if (typeof item === 'string' && item.includes('=')) {
        const eq = item.indexOf('=');
        record[item.slice(0, eq)] = item.slice(eq + 1);
      } else if (isPlainObject(item)) {
        const key = nonEmptyString(item.key) ?? nonEmptyString(item.name);
        if (key) {
          record[key] = item.value == null ? '' : String(item.value);
        }
      }
    }
    return { record: Object.keys(record).length > 0 ? record : undefined, repaired: true };
  }
  if (isPlainObject(raw)) {
    const record: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (value == null) {
        continue;
      }
      record[key] = String(value);
    }
    return { record, repaired: false };
  }
  return { repaired: true };
}

function normalizeEnabled(raw: unknown): { enabled: boolean; repaired: boolean } {
  if (typeof raw === 'boolean') {
    return { enabled: raw, repaired: false };
  }
  if (raw === 0 || raw === 'false' || raw === '0') {
    return { enabled: false, repaired: true };
  }
  if (raw === 1 || raw === 'true' || raw === '1') {
    return { enabled: true, repaired: true };
  }
  // Claude / agent-installed connectors omit `enabled`; they are meant to be active.
  return { enabled: true, repaired: raw !== undefined };
}

function coerceServerEntries(value: unknown): Array<{ key?: string; entry: unknown }> | undefined {
  if (value == null) {
    return undefined;
  }
  const parsed = parseJsonIfString(value);
  if (Array.isArray(parsed)) {
    return parsed.map((entry) => ({ entry }));
  }
  if (isPlainObject(parsed)) {
    return Object.entries(parsed).map(([key, entry]) => ({ key, entry }));
  }
  return undefined;
}

function serversFieldNeedsRepair(value: unknown): boolean {
  return typeof value === 'string' || !Array.isArray(value);
}

export function normalizeMcpServerEntry(
  raw: unknown,
  fallbackKey?: string,
  usedIds?: Set<string>
): { server: McpServerConfig | null; repaired: boolean } {
  if (!isPlainObject(raw)) {
    return { server: null, repaired: true };
  }

  const command = nonEmptyString(raw.command);
  const url = nonEmptyString(raw.url);
  const transportRaw = raw.type ?? raw.transport;
  const transport = normalizeTransportType(transportRaw, Boolean(command), Boolean(url));
  const args = normalizeArgs(raw.args);
  const env = normalizeStringRecord(raw.env);
  const headers = normalizeStringRecord(raw.headers);
  const enabled = normalizeEnabled(raw.enabled);
  const cwd = nonEmptyString(raw.cwd);

  const name =
    nonEmptyString(raw.name) ?? nonEmptyString(fallbackKey) ?? command ?? url ?? 'MCP Server';

  let id = nonEmptyString(raw.id);
  let idRepaired = false;
  if (!id) {
    id = slugify(name)
      ? `mcp-${slugify(name)}`
      : `mcp-${slugify(fallbackKey || 'server') || 'server'}`;
    idRepaired = true;
  }
  if (usedIds) {
    const baseId = id;
    let suffix = 2;
    while (usedIds.has(id)) {
      id = `${baseId}-${suffix}`;
      suffix += 1;
      idRepaired = true;
    }
    usedIds.add(id);
  }

  const server: McpServerConfig = {
    id,
    name,
    type: transport.type,
    enabled: enabled.enabled,
  };

  if (command) {
    server.command = command;
  }
  if (args.args) {
    server.args = args.args;
  }
  if (env.record) {
    server.env = env.record;
  }
  if (cwd) {
    server.cwd = cwd;
  }
  if (url) {
    server.url = url;
  }
  if (headers.record) {
    server.headers = headers.record;
  }

  const repaired =
    idRepaired ||
    transport.repaired ||
    args.repaired ||
    env.repaired ||
    headers.repaired ||
    enabled.repaired ||
    !nonEmptyString(raw.name);

  return { server, repaired };
}

function normalizeEntries(
  entries: Array<{ key?: string; entry: unknown }>,
  source: NormalizeMcpConfigResult['source'],
  collectionRepaired: boolean
): NormalizeMcpConfigResult {
  const usedIds = new Set<string>();
  const servers: McpServerConfig[] = [];
  let skipped = 0;
  let entryRepaired = false;

  for (const item of entries) {
    const normalized = normalizeMcpServerEntry(item.entry, item.key, usedIds);
    if (!normalized.server) {
      skipped += 1;
      entryRepaired = true;
      continue;
    }
    if (normalized.repaired) {
      entryRepaired = true;
    }
    servers.push(normalized.server);
  }

  return {
    servers,
    repaired: collectionRepaired || entryRepaired,
    source,
    skipped,
  };
}

/**
 * Normalize a full `mcp-config.json` document, a `servers` array, or a Claude
 * Desktop `{ mcpServers: { ... } }` map into Open Cowork server configs.
 */
export function normalizeMcpConfigDocument(raw: unknown): NormalizeMcpConfigResult {
  const parsed = parseJsonIfString(raw);
  if (parsed == null) {
    return { servers: [], repaired: false, source: 'empty', skipped: 0 };
  }

  if (Array.isArray(parsed)) {
    const entries = parsed.map((entry) => ({ entry }));
    return normalizeEntries(entries, 'servers', false);
  }

  if (!isPlainObject(parsed)) {
    return { servers: [], repaired: true, source: 'unknown', skipped: 0 };
  }

  const serversField = parsed.servers;
  const mcpServersField = parsed.mcpServers ?? parsed.mcp_servers;
  const serverEntries = coerceServerEntries(serversField);
  const mcpEntries = coerceServerEntries(mcpServersField);
  const serversUnreadable = typeof serversField === 'string' && serverEntries === undefined;
  const mcpUnreadable = mcpServersField != null && mcpEntries === undefined;

  // Prefer a non-empty `servers` list, including JSON strings and keyed maps.
  // An empty array must not hide Claude-style `mcpServers` when electron-store
  // merges `{ servers: [] }` defaults into an agent-installed document.
  if (serverEntries !== undefined && serverEntries.length > 0) {
    return normalizeEntries(serverEntries, 'servers', serversFieldNeedsRepair(serversField));
  }

  if (mcpServersField != null) {
    if (mcpUnreadable) {
      return {
        servers: [],
        repaired: true,
        source: 'mcpServers',
        skipped: 0,
        error: serversUnreadable
          ? 'MCP config `servers` is a string that is not valid JSON (expected an array or object).'
          : 'MCP config `mcpServers` is not a valid server list or map (expected an object, array, or JSON string).',
      };
    }
    return normalizeEntries(mcpEntries ?? [], 'mcpServers', true);
  }

  if (serversUnreadable) {
    return {
      servers: [],
      repaired: true,
      source: 'servers',
      skipped: 0,
      error:
        'MCP config `servers` is a string that is not valid JSON (expected an array or object).',
    };
  }

  if (serverEntries !== undefined) {
    return normalizeEntries(serverEntries, 'servers', serversFieldNeedsRepair(serversField));
  }

  if (serversField === undefined && mcpServersField === undefined) {
    return { servers: [], repaired: false, source: 'empty', skipped: 0 };
  }

  return {
    servers: [],
    repaired: true,
    source: 'servers',
    skipped: 0,
    error:
      'MCP config `servers` has an unsupported type; expected an array, object, or JSON string.',
  };
}

/** Normalize whatever the MCP settings IPC / store might return. */
export function normalizeMcpConfigInput(raw: unknown): NormalizeMcpConfigResult {
  return normalizeMcpConfigDocument(raw);
}

export function collectMcpConnectorRenderFields(
  servers: McpServerConfig[]
): McpConnectorRenderFields[] {
  return servers.map((server) => ({
    key: server.id,
    id: server.id,
    name: server.name,
    typeLabel: formatMcpTypeLabel(server.type),
    commandLine: formatMcpCommandLine(server.command, server.args),
    url: server.url ?? '',
    enabled: server.enabled,
  }));
}

export function normalizeMcpStatusList(raw: unknown): McpServerStatus[] {
  return asArray<unknown>(raw).flatMap((item) => {
    if (!isPlainObject(item)) {
      return [];
    }
    const id = nonEmptyString(item.id);
    if (!id) {
      return [];
    }
    const statusRaw = nonEmptyString(item.status);
    const status: McpServerStatus['status'] =
      statusRaw === 'connecting' ||
      statusRaw === 'connected' ||
      statusRaw === 'failed' ||
      statusRaw === 'disabled'
        ? statusRaw
        : item.connected
          ? 'connected'
          : 'disabled';
    return [
      {
        id,
        name: nonEmptyString(item.name) ?? id,
        connected: Boolean(item.connected),
        status,
        toolCount:
          typeof item.toolCount === 'number' && Number.isFinite(item.toolCount)
            ? item.toolCount
            : 0,
      },
    ];
  });
}

export function normalizeMcpToolList(
  raw: unknown
): Array<Pick<McpTool, 'name' | 'serverId'> & { description?: string }> {
  return asArray<unknown>(raw).flatMap((item) => {
    if (!isPlainObject(item)) {
      return [];
    }
    return [
      {
        serverId: nonEmptyString(item.serverId) ?? '',
        name: nonEmptyString(item.name) ?? '',
        description: nonEmptyString(item.description),
      },
    ];
  });
}

export function normalizeMcpPresetMap<T>(raw: unknown): Record<string, T> {
  return isPlainObject(raw) ? (raw as Record<string, T>) : {};
}
