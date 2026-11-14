import { describe, expect, it } from 'vitest';
import type { Context, Model } from '@mariozechner/pi-ai';
import { streamOpenAICompletions } from '@mariozechner/pi-ai/openai-completions';
import {
  applyPiModelRuntimeOverrides,
  buildSyntheticPiModel,
  buildSyntheticPiModelFromRuntimeConfig,
  resolvePiRegistryModel,
} from '../../main/agent/pi-model-resolution';

const readFileTool = {
  name: 'read_file',
  description: 'Read a file',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string' },
    },
    required: ['path'],
  },
} as unknown as NonNullable<Context['tools']>[number];

const RELAY_FUNCTION_KEYS = ['description', 'name', 'parameters'];

function openAICompat(model: { compat?: unknown }): {
  supportsStrictMode?: boolean;
  supportsStore?: boolean;
} {
  return (model.compat ?? {}) as {
    supportsStrictMode?: boolean;
    supportsStore?: boolean;
  };
}

async function captureChatCompletionPayload(model: Model<'openai-completions'>) {
  let captured: Record<string, unknown> | undefined;
  const stream = streamOpenAICompletions(
    model,
    {
      systemPrompt: 'You are a coding agent.',
      messages: [{ role: 'user', content: 'Read the file', timestamp: 1 }],
      tools: [readFileTool],
    },
    {
      apiKey: 'test-key',
      onPayload: (payload) => {
        captured = payload as Record<string, unknown>;
        throw new Error('captured payload');
      },
    }
  );

  const message = await stream.result();
  expect(message.stopReason).toBe('error');
  expect(message.errorMessage).toContain('captured payload');
  expect(captured).toBeDefined();
  return captured as Record<string, unknown>;
}

function assertNoDeveloperRole(payload: Record<string, unknown>) {
  const messages = payload.messages;
  expect(Array.isArray(messages)).toBe(true);
  for (const message of messages as Array<{ role?: string }>) {
    expect(message.role).not.toBe('developer');
  }
}

function functionTool(tools: unknown): Record<string, unknown> {
  expect(Array.isArray(tools)).toBe(true);
  const first = (tools as Array<{ type?: string; function?: Record<string, unknown> }>)[0];
  expect(first?.type).toBe('function');
  return first?.function ?? {};
}

function assertRelayToolPayload(payload: Record<string, unknown>) {
  const fn = functionTool(payload.tools);
  expect(fn.name).toBe('read_file');
  expect(Object.keys(fn).sort()).toEqual(RELAY_FUNCTION_KEYS);
  expect(fn.strict).toBeUndefined();
  expect(JSON.stringify(payload.tools)).not.toContain('"strict"');
  expect(Object.prototype.hasOwnProperty.call(payload, 'store')).toBe(false);
  assertNoDeveloperRole(payload);
}

describe('OpenAI-compatible tool request shaping', () => {
  it('omits function.strict for TokenMix custom OpenAI relays', async () => {
    const model = buildSyntheticPiModelFromRuntimeConfig(
      {
        model: 'gemini-3.1-pro',
        provider: 'custom',
        customProtocol: 'openai',
        baseUrl: 'https://api.tokenmix.ai/v1',
      },
      {
        resolvedModelString: 'gemini-3.1-pro',
        routeProtocol: 'openai',
        effectiveBaseUrl: 'https://api.tokenmix.ai/v1',
      }
    );
    expect(model.api).toBe('openai-completions');
    expect(openAICompat(model).supportsStrictMode).toBe(false);

    assertRelayToolPayload(
      await captureChatCompletionPayload(model as Model<'openai-completions'>)
    );
  });

  it('omits function.strict when a registry Gemini model is sent through TokenMix', async () => {
    const model = resolvePiRegistryModel('gemini-3.1-pro-preview', {
      configProvider: 'openai',
      rawProvider: 'custom',
      customProtocol: 'openai',
      customBaseUrl: 'https://api.tokenmix.ai/v1',
    });
    expect(model?.api).toBe('openai-completions');
    expect(model?.provider).toBe('google');
    expect(openAICompat(model ?? {}).supportsStrictMode).toBe(false);
    expect(openAICompat(model ?? {}).supportsStore).toBe(false);

    const payload = await captureChatCompletionPayload(model as Model<'openai-completions'>);
    assertRelayToolPayload(payload);
    expect(payload.stream_options).toEqual({ include_usage: true });
  });

  it('omits function.strict for OpenRouter, matching the non-strict default', async () => {
    const model = applyPiModelRuntimeOverrides(
      buildSyntheticPiModel(
        'anthropic/claude-sonnet-4-6',
        'openrouter',
        'openai',
        'https://openrouter.ai/api/v1'
      ),
      {
        configProvider: 'openrouter',
        rawProvider: 'openrouter',
        customBaseUrl: 'https://openrouter.ai/api/v1',
      }
    );
    expect(model.api).toBe('openai-completions');

    const fn = functionTool(
      (await captureChatCompletionPayload(model as Model<'openai-completions'>)).tools
    );

    expect(Object.prototype.hasOwnProperty.call(fn, 'strict')).toBe(false);
  });

  it('still emits strict: false for first-party OpenAI completions', async () => {
    const model = applyPiModelRuntimeOverrides(
      buildSyntheticPiModel('gpt-5.4', 'openai', 'openai', 'https://api.openai.com/v1'),
      {
        configProvider: 'openai',
        rawProvider: 'openai',
        customBaseUrl: 'https://api.openai.com/v1',
      }
    );
    expect(model.api).toBe('openai-completions');
    expect(openAICompat(model).supportsStrictMode).toBeUndefined();

    const fn = functionTool(
      (await captureChatCompletionPayload(model as Model<'openai-completions'>)).tools
    );

    expect(fn.strict).toBe(false);
  });
});
