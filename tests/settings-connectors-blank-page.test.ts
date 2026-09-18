import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  collectMcpConnectorRenderFields,
  normalizeMcpConfigDocument,
} from '../src/shared/mcp-config';

const settingsConnectorsPath = path.resolve(
  process.cwd(),
  'src/renderer/components/settings/SettingsConnectors.tsx'
);
const settingsPanelPath = path.resolve(process.cwd(), 'src/renderer/components/SettingsPanel.tsx');
const tavilyFixturePath = path.resolve(
  process.cwd(),
  'tests/fixtures/mcp-config-agent-tavily.json'
);

const settingsConnectorsSource = readFileSync(settingsConnectorsPath, 'utf8');
const settingsPanelSource = readFileSync(settingsPanelPath, 'utf8');

describe('Settings MCP Connectors blank-page regression (#216)', () => {
  it('normalizes IPC payloads before storing them in React state', () => {
    expect(settingsConnectorsSource).toContain('normalizeMcpConfigInput(loaded).servers');
    expect(settingsConnectorsSource).toContain('formatMcpTypeLabel(server.type)');
    expect(settingsConnectorsSource).toContain('formatMcpCommandLine(server.command, server.args)');
    expect(settingsConnectorsSource).not.toContain('server.type.toUpperCase()');
  });

  it('wraps the connectors tab in a recoverable error boundary instead of a blank panel', () => {
    expect(settingsPanelSource).toContain('name="SettingsConnectors"');
    expect(settingsPanelSource).toContain('SettingsConnectorsFallback');
    expect(settingsPanelSource).toContain("t('mcp.pageErrorTitle')");
    expect(settingsPanelSource).toContain("t('mcp.pageErrorRetry')");
  });

  it('renders connector cards from a realistic agent-installed Tavily mcp-config fixture', () => {
    const document = JSON.parse(readFileSync(tavilyFixturePath, 'utf8')) as unknown;
    const servers = normalizeMcpConfigDocument(document).servers;
    const cards = collectMcpConnectorRenderFields(servers);

    expect(cards).toEqual([
      expect.objectContaining({
        name: 'tavily-mcp',
        typeLabel: 'STDIO',
        commandLine: 'npx -y tavily-mcp@latest',
        enabled: true,
      }),
    ]);
  });
});
