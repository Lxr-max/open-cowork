import { describe, expect, it } from 'vitest';
import {
  SLACK_SOCKET_MODE_APP_TOKEN_REQUIRED,
  SLACK_SOCKET_MODE_BOT_TOKEN_REQUIRED,
  SLACK_WEBHOOK_SIGNING_SECRET_REQUIRED,
  buildSlackSocketChannelConfig,
  getSlackChannelConfigError,
  isSlackSocketConfigComplete,
} from '../../shared/slack-channel-config';

describe('getSlackChannelConfigError', () => {
  it('rejects Socket Mode configs missing botToken', () => {
    expect(
      getSlackChannelConfigError({
        useSocketMode: true,
        appToken: 'xapp-test',
      })
    ).toBe(SLACK_SOCKET_MODE_BOT_TOKEN_REQUIRED);
    expect(
      getSlackChannelConfigError({
        botToken: '   ',
        appToken: 'xapp-test',
      })
    ).toBe(SLACK_SOCKET_MODE_BOT_TOKEN_REQUIRED);
  });

  it('rejects Socket Mode configs missing appToken', () => {
    expect(
      getSlackChannelConfigError({
        botToken: 'xoxb-test',
        useSocketMode: true,
      })
    ).toBe(SLACK_SOCKET_MODE_APP_TOKEN_REQUIRED);
    expect(
      getSlackChannelConfigError({
        botToken: 'xoxb-test',
        appToken: '   ',
      })
    ).toBe(SLACK_SOCKET_MODE_APP_TOKEN_REQUIRED);
  });

  it('rejects webhook configs without signingSecret', () => {
    expect(
      getSlackChannelConfigError({
        botToken: 'xoxb-test',
        useSocketMode: false,
      })
    ).toBe(SLACK_WEBHOOK_SIGNING_SECRET_REQUIRED);
    expect(
      getSlackChannelConfigError({
        botToken: 'xoxb-test',
        useSocketMode: false,
        signingSecret: '  ',
      })
    ).toBe(SLACK_WEBHOOK_SIGNING_SECRET_REQUIRED);
  });

  it('accepts complete Socket Mode and webhook configs', () => {
    expect(
      getSlackChannelConfigError({
        botToken: 'xoxb-test',
        appToken: 'xapp-test',
        useSocketMode: true,
      })
    ).toBeNull();
    expect(
      getSlackChannelConfigError({
        botToken: 'xoxb-test',
        useSocketMode: false,
        signingSecret: 'signing-secret',
      })
    ).toBeNull();
  });
});

describe('isSlackSocketConfigComplete', () => {
  it('requires both bot and app tokens', () => {
    expect(isSlackSocketConfigComplete({ botToken: 'xoxb-test' })).toBe(false);
    expect(isSlackSocketConfigComplete({ appToken: 'xapp-test' })).toBe(false);
    expect(isSlackSocketConfigComplete({ botToken: 'xoxb-test', appToken: 'xapp-test' })).toBe(
      true
    );
  });
});

describe('buildSlackSocketChannelConfig', () => {
  it('persists Socket Mode credentials and DM policy', () => {
    expect(
      buildSlackSocketChannelConfig({
        botToken: '  xoxb-test  ',
        appToken: '  xapp-test  ',
        dmPolicy: 'pairing',
      })
    ).toEqual({
      type: 'slack',
      botToken: 'xoxb-test',
      appToken: 'xapp-test',
      useSocketMode: true,
      dm: { policy: 'pairing' },
    });
  });
});
