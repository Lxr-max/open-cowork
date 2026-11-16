/**
 * Feishu (China) and international Lark Suite use the same API paths on
 * different hosts. An app belongs to one host: credentials for the other
 * are rejected, and the app secret must never be sent to an arbitrary URL.
 *
 * `@larksuiteoapi/node-sdk` resolves `Domain.Feishu` to https://open.feishu.cn
 * and `Domain.Lark` to https://open.larksuite.com. REST calls are
 * `{origin}/open-apis/...`. The long connection asks
 * `{origin}/callback/ws/endpoint` for its socket. The developer console is
 * `{origin}/app`.
 *
 * Only the exact value `lark` selects Lark. Missing or unknown values stay
 * on Feishu so existing installs keep working.
 */

export const FEISHU_OPEN_PLATFORM_ORIGINS = {
  feishu: 'https://open.feishu.cn',
  lark: 'https://open.larksuite.com',
} as const;

export type FeishuDomain = keyof typeof FEISHU_OPEN_PLATFORM_ORIGINS;

export const DEFAULT_FEISHU_DOMAIN: FeishuDomain = 'feishu';

export function normalizeFeishuDomain(value: unknown): FeishuDomain {
  return value === 'lark' ? 'lark' : DEFAULT_FEISHU_DOMAIN;
}

/** Origin passed to the Lark SDK `domain` option. No trailing slash. */
export function getFeishuOpenPlatformOrigin(domain: unknown): string {
  return FEISHU_OPEN_PLATFORM_ORIGINS[normalizeFeishuDomain(domain)];
}

/** Prefix for direct REST calls, including the `/open-apis` path. */
export function getFeishuApiBase(domain: unknown): string {
  return `${getFeishuOpenPlatformOrigin(domain)}/open-apis`;
}

/** Developer console app list for the selected platform. */
export function getFeishuConsoleUrl(domain: unknown): string {
  return `${getFeishuOpenPlatformOrigin(domain)}/app`;
}
