import { describe, expect, it } from 'vitest';
import * as Lark from '@larksuiteoapi/node-sdk';
import {
  getFeishuApiBase,
  getFeishuConsoleUrl,
  getFeishuOpenPlatformOrigin,
  normalizeFeishuDomain,
} from '../../shared/feishu-domain';

function sdkDomain(domain?: Lark.Domain | string): string {
  const client = new Lark.Client({
    appId: 'cli_test',
    appSecret: 'secret',
    domain,
    disableTokenCache: true,
    loggerLevel: Lark.LoggerLevel.error,
  });
  return String(client.domain);
}

describe('Feishu / Lark open platform hosts', () => {
  it('keeps omitted and unknown values on Feishu', () => {
    for (const value of [
      undefined,
      null,
      '',
      'feishu',
      'Feishu',
      'Lark',
      ' lark',
      'larksuite.com',
    ]) {
      expect(normalizeFeishuDomain(value)).toBe('feishu');
      expect(getFeishuOpenPlatformOrigin(value)).toBe('https://open.feishu.cn');
      expect(getFeishuApiBase(value)).toBe('https://open.feishu.cn/open-apis');
      expect(getFeishuConsoleUrl(value)).toBe('https://open.feishu.cn/app');
    }
  });

  it('selects international Lark only for the exact lark preset', () => {
    expect(normalizeFeishuDomain('lark')).toBe('lark');
    expect(getFeishuOpenPlatformOrigin('lark')).toBe('https://open.larksuite.com');
    expect(getFeishuApiBase('lark')).toBe('https://open.larksuite.com/open-apis');
    expect(getFeishuConsoleUrl('lark')).toBe('https://open.larksuite.com/app');
  });

  it('refuses to turn an arbitrary host into an API base', () => {
    const hostile = 'https://127.0.0.1';
    expect(getFeishuApiBase(hostile)).toBe('https://open.feishu.cn/open-apis');
    expect(getFeishuOpenPlatformOrigin(hostile)).not.toContain('127.0.0.1');
    expect(getFeishuConsoleUrl(hostile)).toBe('https://open.feishu.cn/app');
  });

  it('matches the installed Lark SDK domain for both presets', () => {
    expect(sdkDomain(getFeishuOpenPlatformOrigin('lark'))).toBe(sdkDomain(Lark.Domain.Lark));
    expect(sdkDomain(getFeishuOpenPlatformOrigin('lark'))).toBe('https://open.larksuite.com');
    expect(sdkDomain(getFeishuOpenPlatformOrigin('feishu'))).toBe(sdkDomain(Lark.Domain.Feishu));
    expect(sdkDomain(getFeishuOpenPlatformOrigin(undefined))).toBe(sdkDomain(undefined));
    expect(sdkDomain(undefined)).toBe('https://open.feishu.cn');
    expect(getFeishuOpenPlatformOrigin('lark')).not.toContain('/open-apis');
  });
});
