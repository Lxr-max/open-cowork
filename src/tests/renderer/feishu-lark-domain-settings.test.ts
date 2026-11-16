/**
 * @vitest-environment happy-dom
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createElement, useState } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import type { FeishuDomain } from '../../shared/feishu-domain';

const remote = vi.hoisted(() => {
  const state = { domain: undefined as string | undefined };
  const api = {
    state,
    getConfig: vi.fn(),
    getStatus: vi.fn(),
    getPairedUsers: vi.fn(),
    getPendingPairings: vi.fn(),
    getTunnelStatus: vi.fn(),
    getWebhookUrl: vi.fn(),
    updateGatewayConfig: vi.fn(),
    updateFeishuConfig: vi.fn(),
    setEnabled: vi.fn(),
    approvePairing: vi.fn(),
    rejectPairing: vi.fn(),
    revokePairing: vi.fn(),
  };
  const target = window as unknown as { electronAPI: { remote: typeof api } };
  target.electronAPI = { remote: api };
  return api;
});

import i18n from '../../renderer/i18n/config';
import { FeishuConfigStep } from '../../renderer/components/remote/FeishuConfigStep';
import { RemoteControlPanel } from '../../renderer/components/RemoteControlPanel';

const en = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'src/renderer/i18n/locales/en.json'), 'utf8')
) as { remote: Record<string, string> };
const zh = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'src/renderer/i18n/locales/zh.json'), 'utf8')
) as { remote: Record<string, string> };

function DomainHarness({ initial }: { initial: FeishuDomain }) {
  const [domain, setDomain] = useState(initial);
  return createElement(FeishuConfigStep, {
    feishuAppId: 'cli_test',
    feishuAppSecret: 'secret',
    feishuDmPolicy: 'pairing',
    feishuDomain: domain,
    onAppIdChange: () => undefined,
    onAppSecretChange: () => undefined,
    onDmPolicyChange: () => undefined,
    onDomainChange: setDomain,
  });
}

function configPayload() {
  return {
    gateway: {
      enabled: false,
      port: 18789,
      bind: '127.0.0.1',
      defaultWorkingDirectory: '',
      autoApproveSafeTools: true,
      tunnel: { enabled: false, type: 'ngrok' as const },
      auth: { mode: 'pairing' },
    },
    channels: {
      feishu: {
        appId: 'cli_test',
        appSecret: 'secret',
        verificationToken: 'verify-token',
        encryptKey: 'encrypt-key',
        useWebSocket: true,
        dm: { policy: 'pairing' },
        ...(remote.state.domain ? { domain: remote.state.domain } : {}),
      },
    },
  };
}

describe('Feishu / Lark settings', () => {
  beforeEach(async () => {
    remote.state.domain = undefined;
    await i18n.changeLanguage('en');
    remote.getConfig.mockImplementation(async () => configPayload());
    remote.getStatus.mockResolvedValue({
      running: false,
      channels: [],
      activeSessions: 0,
      pendingPairings: 0,
    });
    remote.getPairedUsers.mockResolvedValue([]);
    remote.getPendingPairings.mockResolvedValue([]);
    remote.getTunnelStatus.mockResolvedValue({ connected: false, url: null, provider: 'ngrok' });
    remote.getWebhookUrl.mockResolvedValue(null);
    remote.updateGatewayConfig.mockResolvedValue({ success: true });
    remote.updateFeishuConfig.mockImplementation(async (config: { domain?: string }) => {
      remote.state.domain = config.domain;
      return { success: true };
    });
  });

  afterEach(() => {
    cleanup();
  });

  it('ships platform copy in English and Chinese', () => {
    for (const key of [
      'feishuPlatform',
      'feishuPlatformFeishu',
      'feishuPlatformFeishuDesc',
      'feishuPlatformLark',
      'feishuPlatformLarkDesc',
      'openFeishu',
      'openLark',
    ]) {
      expect(en.remote[key]).toBeTruthy();
      expect(zh.remote[key]).toBeTruthy();
    }
  });

  it('switches the developer console link between Feishu and Lark', async () => {
    render(createElement(DomainHarness, { initial: 'feishu' }));

    const feishuLink = screen.getByRole('link', { name: 'Open Feishu Open Platform' });
    expect(feishuLink.getAttribute('href')).toBe('https://open.feishu.cn/app');
    expect(
      screen.getByRole('button', { name: /open\.feishu\.cn/ }).getAttribute('aria-pressed')
    ).toBe('true');

    fireEvent.click(screen.getByRole('button', { name: /open\.larksuite\.com/ }));

    const larkLink = screen.getByRole('link', { name: 'Open Lark Developer Console' });
    expect(larkLink.getAttribute('href')).toBe('https://open.larksuite.com/app');
    expect(
      screen.getByRole('button', { name: /open\.larksuite\.com/ }).getAttribute('aria-pressed')
    ).toBe('true');

    await i18n.changeLanguage('zh');
    expect(
      (await screen.findByRole('link', { name: '打开 Lark 开发者后台' })).getAttribute('href')
    ).toBe('https://open.larksuite.com/app');
  });

  it('saves Lark and reloads the Lark console link', async () => {
    render(createElement(RemoteControlPanel, { isActive: true }));

    expect(
      (await screen.findByRole('link', { name: 'Open Feishu Open Platform' })).getAttribute('href')
    ).toBe('https://open.feishu.cn/app');

    fireEvent.click(screen.getByRole('button', { name: /open\.larksuite\.com/ }));
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));

    await screen.findByText('Configuration saved');
    expect(remote.updateFeishuConfig).toHaveBeenCalledWith({
      type: 'feishu',
      appId: 'cli_test',
      appSecret: 'secret',
      verificationToken: 'verify-token',
      encryptKey: 'encrypt-key',
      useWebSocket: true,
      domain: 'lark',
      dm: { policy: 'pairing' },
    });
    expect(
      screen.getByRole('link', { name: 'Open Lark Developer Console' }).getAttribute('href')
    ).toBe('https://open.larksuite.com/app');
  });

  it('keeps an existing Feishu setup on open.feishu.cn', async () => {
    render(createElement(RemoteControlPanel, { isActive: true }));
    await screen.findByRole('link', { name: 'Open Feishu Open Platform' });
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
    await screen.findByText('Configuration saved');
    expect(remote.updateFeishuConfig).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'feishu', appId: 'cli_test' })
    );
    expect(
      screen.getByRole('link', { name: 'Open Feishu Open Platform' }).getAttribute('href')
    ).toBe('https://open.feishu.cn/app');
  });

  it('loads a saved Lark preset and treats an unknown domain as Feishu', async () => {
    remote.state.domain = 'lark';
    const larkView = render(createElement(RemoteControlPanel, { isActive: true }));
    expect(
      (await screen.findByRole('link', { name: 'Open Lark Developer Console' })).getAttribute(
        'href'
      )
    ).toBe('https://open.larksuite.com/app');
    larkView.unmount();
    cleanup();

    remote.state.domain = 'https://evil.example';
    render(createElement(RemoteControlPanel, { isActive: true }));
    expect(
      (await screen.findByRole('link', { name: 'Open Feishu Open Platform' })).getAttribute('href')
    ).toBe('https://open.feishu.cn/app');
    fireEvent.click(screen.getByRole('button', { name: 'Save configuration' }));
    await screen.findByText('Configuration saved');
    expect(remote.updateFeishuConfig).toHaveBeenCalledWith(
      expect.objectContaining({ domain: 'feishu' })
    );
  });
});
