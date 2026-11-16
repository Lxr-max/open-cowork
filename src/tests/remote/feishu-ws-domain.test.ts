import { beforeEach, describe, expect, it, vi } from 'vitest';

const sdk = vi.hoisted(() => ({
  clients: [] as Array<Record<string, unknown>>,
  sockets: [] as Array<Record<string, unknown>>,
  starts: 0,
}));

vi.mock('../../main/utils/logger', () => ({
  log: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

vi.mock('@larksuiteoapi/node-sdk', () => ({
  LoggerLevel: {
    debug: 4,
    info: 3,
    warn: 2,
    error: 1,
  },
  EventDispatcher: class EventDispatcher {
    register() {
      return this;
    }
  },
  Client: class Client {
    constructor(config: Record<string, unknown>) {
      sdk.clients.push(config);
    }
  },
  WSClient: class WSClient {
    constructor(config: Record<string, unknown>) {
      sdk.sockets.push(config);
    }
    start() {
      sdk.starts += 1;
      return Promise.resolve();
    }
    close() {}
  },
}));

import { FeishuWSClient } from '../../main/remote/channels/feishu/feishu-ws-client';

describe('FeishuWSClient open platform host', () => {
  beforeEach(() => {
    sdk.clients.length = 0;
    sdk.sockets.length = 0;
    sdk.starts = 0;
  });

  async function start(domain?: unknown) {
    const client = new FeishuWSClient({
      appId: 'cli_test',
      appSecret: 'secret',
      domain,
    });
    await client.start();
    return client;
  }

  it('uses the Feishu origin by default', async () => {
    await start();
    expect(sdk.clients[0]?.domain).toBe('https://open.feishu.cn');
    expect(sdk.sockets[0]?.domain).toBe('https://open.feishu.cn');
    expect(sdk.starts).toBe(1);
  });

  it('passes the Lark origin, not the REST prefix, to the SDK', async () => {
    await start('lark');
    expect(sdk.clients[0]).toMatchObject({
      appId: 'cli_test',
      appSecret: 'secret',
      domain: 'https://open.larksuite.com',
    });
    expect(sdk.sockets[0]).toMatchObject({
      appId: 'cli_test',
      appSecret: 'secret',
      domain: 'https://open.larksuite.com',
    });
    expect(String(sdk.clients[0]?.domain)).not.toContain('/open-apis');
    expect(String(sdk.sockets[0]?.domain)).not.toContain('/open-apis');
  });

  it('ignores an arbitrary domain string', async () => {
    await start('https://open.larksuite.com.evil.example');
    expect(sdk.clients[0]?.domain).toBe('https://open.feishu.cn');
    expect(sdk.sockets[0]?.domain).toBe('https://open.feishu.cn');
  });
});
