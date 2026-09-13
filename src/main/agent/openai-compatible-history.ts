/**
 * Outbound history shaping for OpenAI-compatible Chat Completions.
 *
 * Models such as DeepSeek V4 emit Anthropic-style `{ type: "thinking" }` content
 * blocks. Those are stored in session/DB history (so the UI and the Anthropic
 * protocol path can replay them). Re-sending them to an OpenAI-compatible
 * endpoint (e.g. `https://api.deepseek.com`) fails with:
 *
 *   unknown variant `thinking`, expected `text`
 *
 * Filter thinking blocks only when building the OpenAI-compatible request.
 * Do not mutate stored history.
 */

export type ChatProtocol = 'openai-compatible' | 'anthropic-compatible';

export type HistoryContentBlock = {
  type: string;
  [key: string]: unknown;
};

export type OpenAICompatibleChatMessage = {
  role?: string;
  content?: unknown;
  tool_calls?: unknown;
  [key: string]: unknown;
};

export function isThinkingContentPart(part: unknown): boolean {
  return Boolean(
    part && typeof part === 'object' && (part as { type?: unknown }).type === 'thinking'
  );
}

/**
 * Drop `thinking` blocks for the OpenAI-compatible protocol. Keep text, tool_use,
 * and tool_result. Anthropic-compatible history is returned unchanged.
 */
export function filterHistoryBlocksForChatProtocol<T extends HistoryContentBlock>(
  blocks: T[],
  protocol: ChatProtocol
): T[] {
  if (protocol === 'anthropic-compatible') {
    return blocks;
  }
  return blocks.filter((block) => block.type !== 'thinking');
}

export function stripThinkingPartsFromOpenAIContent<T>(content: T): T {
  if (!Array.isArray(content)) {
    return content;
  }
  return content.filter((part) => !isThinkingContentPart(part)) as T;
}

/**
 * Strip Anthropic-style thinking parts from an OpenAI Chat Completions payload.
 * Tool calls stay on `tool_calls`; tool results stay on `role: "tool"`.
 */
export function stripThinkingBlocksFromOpenAICompatibleMessages<
  M extends OpenAICompatibleChatMessage,
>(messages: M[]): M[] {
  return messages.map((message) => {
    if (!Array.isArray(message.content)) {
      return message;
    }
    const content = stripThinkingPartsFromOpenAIContent(message.content);
    if (content.length === message.content.length) {
      return message;
    }
    return { ...message, content };
  });
}

/**
 * Locate `{ type: "thinking" }` content parts that would 400 on DeepSeek's
 * OpenAI-compatible schema (`unknown variant 'thinking', expected 'text'`).
 */
export function findOpenAICompatibleThinkingVariants(
  messages: OpenAICompatibleChatMessage[]
): Array<{ messageIndex: number; partIndex: number; role?: string }> {
  const hits: Array<{ messageIndex: number; partIndex: number; role?: string }> = [];
  messages.forEach((message, messageIndex) => {
    if (!Array.isArray(message.content)) {
      return;
    }
    message.content.forEach((part, partIndex) => {
      if (isThinkingContentPart(part)) {
        hits.push({ messageIndex, partIndex, role: message.role });
      }
    });
  });
  return hits;
}
