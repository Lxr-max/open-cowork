import { beforeEach, describe, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const storeState: { data: Record<string, unknown> } = { data: { servers: [] } };

vi.mock('electron-store', () => {
  class MockStore {
    get(key: string, defaultValue?: unknown) {
      return Object.prototype.hasOwnProperty.call(storeState.data, key)
        ? storeState.data[key]
        : defaultValue;
    }

    set(key: string, value: unknown) {
      storeState.data[key] = value;
    }

    delete(key: string) {
      delete storeState.data[key];
    }

    get store() {
      return storeState.data;
    }
  }

  return { default: MockStore };
});

vi.mock('../src/main/utils/logger', () => ({
  log: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

import { mcpConfigStore } from '../src/main/mcp/mcp-config-store';

const fixturesDir = path.resolve(process.cwd(), 'tests/fixtures');

function loadFixture(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(path.join(fixturesDir, name), 'utf8')) as Record<string, unknown>;
}

describe('MCPConfigStore malformed document healing', () => {
  beforeEach(() => {
    storeState.data = { servers: [] };
  });

  it('returns a servers array for an agent-installed Tavily map and persists the repair', () => {
    storeState.data = loadFixture('mcp-config-agent-tavily.json');

    const servers = mcpConfigStore.getServers();
    expect(Array.isArray(servers)).toBe(true);
    expect(servers).toHaveLength(1);
    expect(servers[0].name).toBe('tavily-mcp');
    expect(servers[0].type).toBe('stdio');
    expect(Array.isArray(storeState.data.servers)).toBe(true);
  });

  it('adopts Claude mcpServers documents so getEnabledServers does not throw', () => {
    storeState.data = loadFixture('mcp-config-claude-mcpServers.json');

    expect(() => mcpConfigStore.getEnabledServers()).not.toThrow();
    const enabled = mcpConfigStore.getEnabledServers();
    expect(enabled.some((server) => server.name === 'tavily-mcp')).toBe(true);
    expect(storeState.data.mcpServers).toBeUndefined();
  });

  it('heals JSON-string servers into a persisted array', () => {
    const tavily = loadFixture('mcp-config-agent-tavily.json');
    storeState.data = { servers: JSON.stringify(tavily.servers) };

    const servers = mcpConfigStore.getServers();
    expect(servers).toHaveLength(1);
    expect(servers[0].name).toBe('tavily-mcp');
    expect(Array.isArray(storeState.data.servers)).toBe(true);
    expect((storeState.data.servers as Array<{ name: string }>)[0].name).toBe('tavily-mcp');
  });

  it('does not overwrite an unreadable servers string with an empty array', () => {
    storeState.data = { servers: 'not-json-config' };

    const servers = mcpConfigStore.getServers();
    expect(servers).toEqual([]);
    expect(storeState.data.servers).toBe('not-json-config');
  });

  it('adopts mcpServers when the store document also has a default empty servers array', () => {
    storeState.data = {
      servers: [],
      ...loadFixture('mcp-config-claude-mcpServers.json'),
    };

    const servers = mcpConfigStore.getServers();
    expect(servers.some((server) => server.name === 'tavily-mcp')).toBe(true);
    expect(Array.isArray(storeState.data.servers)).toBe(true);
    expect((storeState.data.servers as unknown[]).length).toBeGreaterThan(0);
    expect(storeState.data.mcpServers).toBeUndefined();
  });
});
