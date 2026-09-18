import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  collectMcpConnectorRenderFields,
  normalizeMcpConfigDocument,
} from '../src/shared/mcp-config';

const fixturesDir = path.resolve(process.cwd(), 'tests/fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), 'utf8')) as unknown;
}

/**
 * Mirrors the pre-fix SettingsConnectors list render:
 * `servers.map` + `server.type.toUpperCase()` + `server.args.join(' ')`.
 * This is the crash that blanked the MCP Connectors tab.
 */
function legacySettingsConnectorsRender(servers: unknown) {
  return (servers as Array<{ id: string; type: string; command?: string; args?: string[] }>).map(
    (server) => ({
      key: server.id,
      typeLabel: server.type.toUpperCase(),
      commandLine: `${server.command} ${server.args?.join(' ') || ''}`,
    })
  );
}

describe('MCP config normalization (issue #216)', () => {
  it('would have crashed the settings list on an agent-installed Tavily map', () => {
    const document = loadFixture('mcp-config-agent-tavily.json') as { servers: unknown };
    expect(() => legacySettingsConnectorsRender(document.servers)).toThrow();
  });

  it('would have crashed on mixed configs missing type or using string args', () => {
    const document = loadFixture('mcp-config-mixed-agent-installed.json') as { servers: unknown[] };
    expect(() => legacySettingsConnectorsRender(document.servers)).toThrow();
  });

  it('normalizes a Tavily servers-map into renderable connector cards', () => {
    const document = loadFixture('mcp-config-agent-tavily.json');
    const result = normalizeMcpConfigDocument(document);

    expect(result.repaired).toBe(true);
    expect(result.servers).toHaveLength(1);
    expect(result.servers[0]).toMatchObject({
      name: 'tavily-mcp',
      type: 'stdio',
      command: 'npx',
      args: ['-y', 'tavily-mcp@latest'],
      enabled: true,
    });
    expect(result.servers[0].id).toMatch(/^mcp-tavily-mcp/);
    expect(result.servers[0].env).toEqual({ TAVILY_API_KEY: 'tvly-test-key' });

    expect(() => collectMcpConnectorRenderFields(result.servers)).not.toThrow();
    expect(collectMcpConnectorRenderFields(result.servers)[0].typeLabel).toBe('STDIO');
  });

  it('adopts Claude-style mcpServers documents including HTTP Tavily remotes', () => {
    const document = loadFixture('mcp-config-claude-mcpServers.json');
    const result = normalizeMcpConfigDocument(document);

    expect(result.source).toBe('mcpServers');
    expect(result.servers.map((server) => server.name).sort()).toEqual([
      'tavily-mcp',
      'tavily-remote',
    ]);

    const remote = result.servers.find((server) => server.name === 'tavily-remote');
    expect(remote?.type).toBe('streamable-http');
    expect(remote?.url).toContain('mcp.tavily.com');

    const cards = collectMcpConnectorRenderFields(result.servers);
    expect(cards).toHaveLength(2);
    expect(
      cards.every((card) => typeof card.typeLabel === 'string' && card.typeLabel.length > 0)
    ).toBe(true);
  });

  it('keeps valid Open Cowork servers and repairs agent-installed Tavily rows', () => {
    const document = loadFixture('mcp-config-mixed-agent-installed.json');
    const result = normalizeMcpConfigDocument(document);

    expect(result.skipped).toBe(1);
    expect(result.servers).toHaveLength(2);

    const chrome = result.servers.find((server) => server.id === 'mcp-chrome-1');
    expect(chrome).toMatchObject({
      name: 'Chrome',
      type: 'stdio',
      enabled: true,
    });

    const tavily = result.servers.find((server) => server.name === 'tavily-mcp');
    expect(tavily?.type).toBe('stdio');
    expect(tavily?.args).toEqual(['-y', 'tavily-mcp@latest']);
    expect(tavily?.env).toEqual({ TAVILY_API_KEY: 'tvly-test-key' });

    expect(() => collectMcpConnectorRenderFields(result.servers)).not.toThrow();
  });

  it('returns an empty list for null/invalid documents instead of throwing', () => {
    expect(normalizeMcpConfigDocument(null).servers).toEqual([]);
    expect(normalizeMcpConfigDocument('not-json').servers).toEqual([]);
    expect(normalizeMcpConfigDocument(42).servers).toEqual([]);
    expect(normalizeMcpConfigDocument({ servers: 'oops' }).servers).toEqual([]);
  });

  it('leaves a canonical Open Cowork servers array unchanged', () => {
    const document = {
      servers: [
        {
          id: 'mcp-notion-1',
          name: 'Notion',
          type: 'stdio' as const,
          command: 'npx',
          args: ['-y', '@notionhq/notion-mcp-server'],
          enabled: false,
        },
      ],
    };
    const result = normalizeMcpConfigDocument(document);
    expect(result.repaired).toBe(false);
    expect(result.servers).toEqual(document.servers);
  });
});
