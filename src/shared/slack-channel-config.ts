/**
 * Slack channel config helpers shared by renderer validation and main IPC.
 *
 * Remote Control settings persist Socket Mode only (`useSocketMode: true`).
 * Webhook mode (`useSocketMode === false`) requires `signingSecret` because
 * SlackChannel.verifySlackSignature rejects requests without it.
 */

import type { SlackChannelConfig } from './ipc-types';

export const SLACK_SOCKET_MODE_BOT_TOKEN_REQUIRED = 'Slack Socket Mode requires a bot token';
export const SLACK_SOCKET_MODE_APP_TOKEN_REQUIRED = 'Slack Socket Mode requires an app token';
export const SLACK_WEBHOOK_SIGNING_SECRET_REQUIRED = 'Slack webhook mode requires a signing secret';

export function getSlackChannelConfigError(config: {
  botToken?: string;
  appToken?: string;
  useSocketMode?: boolean;
  signingSecret?: string;
}): string | null {
  if (!config.botToken?.trim()) {
    return SLACK_SOCKET_MODE_BOT_TOKEN_REQUIRED;
  }

  if (config.useSocketMode === false) {
    if (!config.signingSecret?.trim()) {
      return SLACK_WEBHOOK_SIGNING_SECRET_REQUIRED;
    }
    return null;
  }

  if (!config.appToken?.trim()) {
    return SLACK_SOCKET_MODE_APP_TOKEN_REQUIRED;
  }

  return null;
}

export function isSlackSocketConfigComplete(config: {
  botToken?: string;
  appToken?: string;
}): boolean {
  return Boolean(config.botToken?.trim() && config.appToken?.trim());
}

export function buildSlackSocketChannelConfig(input: {
  botToken: string;
  appToken: string;
  dmPolicy: SlackChannelConfig['dm']['policy'];
}): SlackChannelConfig {
  return {
    type: 'slack',
    botToken: input.botToken.trim(),
    appToken: input.appToken.trim(),
    useSocketMode: true,
    dm: { policy: input.dmPolicy },
  };
}
