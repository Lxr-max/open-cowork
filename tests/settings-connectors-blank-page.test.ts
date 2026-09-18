import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { createElement } from 'react';
import {
  collectMcpConnectorRenderFields,
  formatMcpTypeLabel,
  normalizeMcpConfigInput,
} from '../src/shared/mcp-config';
import { PanelErrorBoundary } from '../src/renderer/components/PanelErrorBoundary';

const settingsPanelPath = path.resolve(process.cwd(), 'src/renderer/components/SettingsPanel.tsx');
const fixturesDir = path.resolve(process.cwd(), 'tests/fixtures');

function loadFixture(name: string): unknown {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), 'utf8')) as unknown;
}

/** Same pipeline SettingsConnectors uses after `mcp.getServers()`. */
function connectorCardsFromIpcPayload(loaded: unknown) {
  return collectMcpConnectorRenderFields(normalizeMcpConfigInput(loaded).servers);
}

describe('Settings MCP Connectors blank-page regression (#216)', () => {
  it('turns malformed IPC / agent-installed payloads into renderable connector cards', () => {
    const tavilyDocument = loadFixture('mcp-config-agent-tavily.json');
    const mixedDocument = loadFixture('mcp-config-mixed-agent-installed.json');
    const stringEncoded = {
      servers: JSON.stringify((tavilyDocument as { servers: unknown }).servers),
    };

    for (const payload of [tavilyDocument, mixedDocument, stringEncoded]) {
      const cards = connectorCardsFromIpcPayload(payload);
      expect(cards.length).toBeGreaterThan(0);
      expect(
        cards.every(
          (card) =>
            typeof card.name === 'string' &&
            card.name.length > 0 &&
            typeof card.typeLabel === 'string' &&
            card.typeLabel.length > 0
        )
      ).toBe(true);
    }

    const tavilyCards = connectorCardsFromIpcPayload(tavilyDocument);
    expect(tavilyCards).toEqual([
      expect.objectContaining({
        name: 'tavily-mcp',
        typeLabel: 'STDIO',
        commandLine: 'npx -y tavily-mcp@latest',
        enabled: true,
      }),
    ]);
  });

  it('does not throw when connector type or args are missing (legacy list crash)', () => {
    expect(formatMcpTypeLabel(undefined)).toBe('STDIO');
    expect(() =>
      collectMcpConnectorRenderFields(
        normalizeMcpConfigInput({
          servers: [{ name: 'tavily-mcp', command: 'npx', args: '-y tavily-mcp@latest' }],
        }).servers
      )
    ).not.toThrow();
  });

  it('shows the connectors fallback after a render error and recovers on Retry resetKey', () => {
    const fallback = createElement('button', { type: 'button' }, 'Retry');
    const children = createElement('div', null, 'connectors');

    expect(PanelErrorBoundary.getDerivedStateFromError()).toEqual({ hasError: true });

    const recovered = PanelErrorBoundary.getDerivedStateFromProps(
      {
        name: 'SettingsConnectors',
        fallback,
        children,
        resetKey: 'connectors:1',
      },
      { hasError: true, prevResetKey: 'connectors:0' }
    );
    expect(recovered).toEqual({ hasError: false, prevResetKey: 'connectors:1' });

    const boundary = new PanelErrorBoundary({
      name: 'SettingsConnectors',
      fallback,
      children,
      resetKey: 'connectors:0',
    });
    boundary.state = { hasError: true, prevResetKey: 'connectors:0' };
    expect(boundary.render()).toBe(fallback);

    boundary.state = { hasError: false, prevResetKey: 'connectors:1' };
    expect(boundary.render()).toBe(children);
  });

  it('keeps the MCP Connectors tab inside a retryable PanelErrorBoundary', () => {
    const source = readFileSync(settingsPanelPath, 'utf8');
    const tabStart = source.indexOf("activeTab === 'connectors'");
    expect(tabStart).toBeGreaterThan(-1);
    const connectorsBlock = source.slice(tabStart, tabStart + 1200);
    expect(connectorsBlock).toMatch(
      /<PanelErrorBoundary[\s\S]*name="SettingsConnectors"[\s\S]*onRetry[\s\S]*<SettingsConnectors/
    );
    expect(source).toMatch(
      /function SettingsConnectorsFallback[\s\S]*onRetry[\s\S]*mcp\.pageErrorRetry/
    );
  });
});
