import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('../../main/utils/logger', () => ({
  log: vi.fn(),
  logError: vi.fn(),
  logWarn: vi.fn(),
}));

import { FeishuAPI } from '../../main/remote/channels/feishu/feishu-api';

interface CapturedCall {
  url: string;
  body?: string;
}

function installFetch(): CapturedCall[] {
  const calls: CapturedCall[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({
        url,
        body: typeof init?.body === 'string' ? init.body : undefined,
      });
      const payload = url.includes('/auth/')
        ? { code: 0, msg: 'ok', tenant_access_token: 'tenant-token', expire: 7200 }
        : url.includes('/bot/')
          ? {
              code: 0,
              msg: 'ok',
              bot: {
                activate_status: 2,
                app_name: 'Bot',
                avatar_url: '',
                ip_white_list: [],
                open_id: 'ou_bot',
              },
            }
          : { code: 0, msg: 'ok', data: { message_id: 'om_1' } };
      return new Response(JSON.stringify(payload), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    })
  );
  return calls;
}

describe('FeishuAPI open platform host', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  async function exchangeAndSend(domain?: unknown): Promise<CapturedCall[]> {
    const calls = installFetch();
    const api = new FeishuAPI('cli_test', 'app-secret', domain);
    await api.getBotInfo();
    await api.sendMessage('oc_chat', 'text', { text: 'hi' });
    return calls;
  }

  it('calls Feishu when no domain is configured', async () => {
    const calls = await exchangeAndSend();
    expect(calls.map((call) => call.url)).toEqual([
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal',
      'https://open.feishu.cn/open-apis/bot/v3/info',
      'https://open.feishu.cn/open-apis/im/v1/messages?receive_id_type=chat_id',
    ]);
    expect(calls[0]?.body).toContain('"app_secret":"app-secret"');
  });

  it('calls international Lark for the lark preset', async () => {
    const calls = await exchangeAndSend('lark');
    expect(calls.map((call) => call.url)).toEqual([
      'https://open.larksuite.com/open-apis/auth/v3/tenant_access_token/internal',
      'https://open.larksuite.com/open-apis/bot/v3/info',
      'https://open.larksuite.com/open-apis/im/v1/messages?receive_id_type=chat_id',
    ]);
    expect(calls.every((call) => !call.url.includes('open.feishu.cn'))).toBe(true);
    expect(calls[0]?.body).toContain('"app_id":"cli_test"');
  });

  it('does not post the app secret to an unrecognized host', async () => {
    const calls = await exchangeAndSend('https://evil.example');
    expect(calls[0]?.url).toBe(
      'https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal'
    );
    expect(calls.every((call) => call.url.startsWith('https://open.feishu.cn/open-apis/'))).toBe(
      true
    );
  });
});
