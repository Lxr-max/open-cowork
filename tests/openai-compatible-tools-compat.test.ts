import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import {
  applyPiModelRuntimeOverrides,
  buildSyntheticPiModel,
} from '../src/main/agent/pi-model-resolution';

/**
 * Mirrors `@mariozechner/pi-ai` 0.60.0 `convertTools` in
 * `dist/providers/openai-completions.js`. The SDK does not export that helper.
 */
function convertOpenAICompletionsTools(
  tools: Array<{ name: string; description: string; parameters: Record<string, unknown> }>,
  compat: { supportsStrictMode?: boolean }
) {
  return tools.map((tool) => ({
    type: 'function' as const,
    function: {
      name: tool.name,
      description: tool.description,
      parameters: tool.parameters,
      ...(compat.supportsStrictMode !== false && { strict: false }),
    },
  }));
}

const readFileTool = {
  name: 'read_file',
  description: 'Read a file',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string' },
    },
  },
};

describe('OpenAI-compatible tool request shaping', () => {
  it('keeps pi-ai convertTools gated on supportsStrictMode', () => {
    const completionsPath = path.resolve(
      'node_modules/@mariozechner/pi-ai/dist/providers/openai-completions.js'
    );
    if (!fs.existsSync(completionsPath)) {
      throw new Error('Expected @mariozechner/pi-ai to be installed before running this suite');
    }

    const source = fs.readFileSync(completionsPath, 'utf8');
    expect(source).toContain('function convertTools(');
    expect(source).toContain('...(compat.supportsStrictMode !== false && { strict: false })');
  });

  it('omits function.strict for TokenMix custom OpenAI relays', () => {
    const model = applyPiModelRuntimeOverrides(
      buildSyntheticPiModel('gemini-3.1-pro', 'openai', 'openai', 'https://api.tokenmix.ai/v1'),
      {
        configProvider: 'openai',
        rawProvider: 'custom',
        customProtocol: 'openai',
        customBaseUrl: 'https://api.tokenmix.ai/v1',
      }
    );

    const tools = convertOpenAICompletionsTools([readFileTool], {
      supportsStrictMode: (model.compat as { supportsStrictMode?: boolean } | undefined)
        ?.supportsStrictMode,
    });
    const fn = tools[0]?.function as Record<string, unknown>;

    expect(tools[0]?.type).toBe('function');
    expect(fn.name).toBe('read_file');
    expect(fn.strict).toBeUndefined();
    expect(Object.prototype.hasOwnProperty.call(fn, 'strict')).toBe(false);
  });

  it('still emits strict: false for first-party OpenAI completions', () => {
    const model = applyPiModelRuntimeOverrides(
      buildSyntheticPiModel('gpt-5.4', 'openai', 'openai', 'https://api.openai.com/v1'),
      {
        configProvider: 'openai',
        rawProvider: 'openai',
        customBaseUrl: 'https://api.openai.com/v1',
      }
    );

    const tools = convertOpenAICompletionsTools([readFileTool], {
      supportsStrictMode: (model.compat as { supportsStrictMode?: boolean } | undefined)
        ?.supportsStrictMode,
    });
    const fn = tools[0]?.function as Record<string, unknown>;

    expect(fn.strict).toBe(false);
  });
});
