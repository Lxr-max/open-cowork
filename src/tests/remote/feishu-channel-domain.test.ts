import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { FeishuChannelConfig } from '../../main/remote/types';

vi.mock('../../main/utils/logger', () => ({
  log: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

const created = vi.hoisted(() => ({
  apis: [] as unknown[][],
  sockets: [] as unknown[],
}));

vi.mock('../../main/remote/channels/feishu/feishu-api', () => ({
  FeishuAPI: class FeishuAPI {
    constructor(...args: unknown[]) {
      created.apis.push(args);
    }
    refreshToken() {
      return Promise.resolve('token');
    }
    getBotInfo() {
      return Promise.resolve({ open_id: 'ou_bot', app_name: 'Bot', avatar_url: '' });
    }
  },
}));

vi.mock('../../main/remote/channels/feishu/feishu-ws-client', () => ({
  FeishuWSClient: class FeishuWSClient {
    constructor(config: unknown) {
      created.sockets.push(config);
    }
    on() {
      return this;
    }
    removeAllListeners() {
      return this;
    }
    start() {
      return Promise.resolve();
    }
    stop() {
      return Promise.resolve();
    }
  },
}));

import { FeishuChannel } from '../../main/remote/channels/feishu/feishu-channel';

function config(overrides: Partial<FeishuChannelConfig> = {}): FeishuChannelConfig {
  return {
    type: 'feishu',
    appId: 'cli_test',
    appSecret: 'secret',
    useWebSocket: false,
    dm: { policy: 'pairing' },
    ...overrides,
  };
}

describe('FeishuChannel domain wiring', () => {
  beforeEach(() => {
    created.apis.length = 0;
    created.sockets.length = 0;
  });

  it('keeps the API client on Feishu when domain is omitted', async () => {
    const channel = new FeishuChannel(config());
    await channel.start();
    expect(created.apis).toEqual([['cli_test', 'secret', undefined]]);
    expect(created.sockets).toEqual([]);
    await channel.stop();
  });

  it('passes the lark preset to the API client and the long connection', async () => {
    const channel = new FeishuChannel(config({ domain: 'lark', useWebSocket: true }));
    await channel.start();
    expect(created.apis[0]).toEqual(['cli_test', 'secret', 'lark']);
    expect(created.sockets).toEqual([
      expect.objectContaining({
        appId: 'cli_test',
        appSecret: 'secret',
        domain: 'lark',
      }),
    ]);
    await channel.stop();
  });
});
