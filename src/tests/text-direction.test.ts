import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MessageMarkdown } from '../renderer/components/MessageMarkdown';
import { CodeBlock } from '../renderer/components/message/CodeBlock';
import { ContentBlockView } from '../renderer/components/message/ContentBlockView';
import { MessageCard } from '../renderer/components/MessageCard';
import {
  AUTO_TEXT_DIRECTION_PROPS,
  getTextAlignmentClass,
  getTextDirectionProps,
} from '../renderer/utils/text-direction';

describe('automatic chat text direction', () => {
  it('delegates direction detection to the browser for every text block', () => {
    expect(AUTO_TEXT_DIRECTION_PROPS.dir).toBe('auto');
  });

  it('isolates mixed-direction text from the surrounding interface', () => {
    expect(AUTO_TEXT_DIRECTION_PROPS.style.unicodeBidi).toBe('plaintext');
  });

  it('uses explicit isolation for either manual direction and restores auto', () => {
    expect(getTextDirectionProps('rtl')).toEqual({
      dir: 'rtl',
      style: { unicodeBidi: 'isolate' },
    });
    expect(getTextDirectionProps('ltr').dir).toBe('ltr');
    expect(getTextDirectionProps('auto')).toBe(AUTO_TEXT_DIRECTION_PROPS);
    expect(getTextAlignmentClass('auto')).toBe('text-start');
    expect(getTextAlignmentClass('ltr')).toBe('text-left');
    expect(getTextAlignmentClass('rtl')).toBe('text-left');
  });

  it('renders the same source text with a manually selected paragraph direction', () => {
    const text = 'React هي مكتبة لبناء واجهات المستخدم.';
    const auto = renderToStaticMarkup(createElement(MessageMarkdown, { normalizedText: text }));
    const rtl = renderToStaticMarkup(
      createElement(MessageMarkdown, { normalizedText: text, textDirection: 'rtl' })
    );

    expect(auto).toContain('dir="auto"');
    expect(rtl).toContain('dir="rtl"');
    expect(rtl).toContain('unicode-bidi:isolate');
    expect(rtl).toContain('text-left');
    expect(auto).toContain('text-start');
    expect(rtl).toContain(text);
    expect(auto).toContain(text);
  });

  it('keeps separate automatic paragraphs and Markdown source intact', () => {
    const text = 'React هي مكتبة لبناء واجهات المستخدم.\n\nThe Arabic label is مرحبا.';
    const auto = renderToStaticMarkup(createElement(MessageMarkdown, { normalizedText: text }));
    const rtl = renderToStaticMarkup(
      createElement(MessageMarkdown, { normalizedText: text, textDirection: 'rtl' })
    );

    expect(auto).toContain('dir="auto"');
    // Direction is applied to the markdown wrapper, not each paragraph.
    // Count the opening tag boundary so a future attribute on <p>
    // still counts that paragraph instead of dropping the match.
    expect(auto.match(/<p\b/g)).toHaveLength(2);
    expect(rtl).toContain('dir="rtl"');
    expect(rtl).toContain('text-left');
    for (const paragraph of text.split('\n\n')) {
      expect(auto).toContain(paragraph);
      expect(rtl).toContain(paragraph);
    }
  });

  it('keeps user message prose left-aligned with manual RTL reading order', () => {
    const text = 'React هي مكتبة لبناء واجهات المستخدم.';
    const markup = renderToStaticMarkup(
      createElement(ContentBlockView, {
        block: { type: 'text', text },
        isUser: true,
        textDirection: 'rtl',
      })
    );

    expect(markup).toContain('dir="rtl"');
    expect(markup).toContain('text-left');
    expect(markup).toContain(text);
  });

  it('applies the selected direction to collapsed thinking text', () => {
    const thinking = 'React هي مكتبة لبناء واجهات المستخدم.';
    const markup = renderToStaticMarkup(
      createElement(ContentBlockView, {
        block: { type: 'thinking', thinking },
        isUser: false,
        textDirection: 'rtl',
      })
    );

    expect(markup).toContain('dir="rtl"');
    expect(markup).toContain('unicode-bidi:isolate');
    expect(markup).toContain('text-left');
    expect(markup).toContain(thinking);
  });

  it('keeps fenced code independently left-to-right', () => {
    const markup = renderToStaticMarkup(
      createElement(CodeBlock, { language: 'js', children: '// مرحبا' })
    );
    expect(markup).toContain('dir="ltr"');
    expect(markup).toContain('unicode-bidi:isolate');
  });

  it('keeps message controls in a separate hover group from code tools', () => {
    const message = renderToStaticMarkup(
      createElement(MessageCard, {
        message: {
          id: 'message-1',
          sessionId: 'session-1',
          role: 'user',
          content: [{ type: 'text', text: 'Hello' }],
          timestamp: 1,
        },
      })
    );
    const code = renderToStaticMarkup(
      createElement(CodeBlock, { language: 'js', children: 'const n = 1;' })
    );

    expect(message).toContain('group/message');
    expect(message).toContain('sm:group-hover/message:opacity-100');
    expect(code).toContain('class="relative group my-3"');
    expect(code).toContain('group-hover:opacity-100');
  });
});
