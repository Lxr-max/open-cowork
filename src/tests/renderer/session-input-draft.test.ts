import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const chatViewPath = path.resolve(process.cwd(), 'src/renderer/components/ChatView.tsx');
const hookPath = path.resolve(process.cwd(), 'src/renderer/hooks/useSessionInputDraft.ts');
const chatViewSource = readFileSync(chatViewPath, 'utf8');
const hookSource = readFileSync(hookPath, 'utf8');

describe('ChatView input draft retention', () => {
  it('binds the composer to a per-session draft hook', () => {
    expect(chatViewSource).toContain(
      "import { useSessionInputDraft } from '../hooks/useSessionInputDraft';"
    );
    expect(chatViewSource).toContain('useSessionInputDraft(activeSessionId)');
  });

  it('clears the composer after a successful send', () => {
    expect(chatViewSource).toContain("setPrompt('');");
  });

  it('persists the current draft when switching or leaving a session', () => {
    expect(hookSource).toContain('writeDraft(previousId, promptRef.current)');
    expect(hookSource).toContain('writeDraft(sessionIdRef.current, promptRef.current)');
    expect(hookSource).toContain('writeDraft(sessionIdRef.current, value)');
    expect(hookSource).toContain('setSessionInputDraft');
  });

  it('restores the saved draft for the newly active session', () => {
    expect(hookSource).toContain('setPromptState(readDraft(sessionId))');
    expect(hookSource).toContain('sessionInputDrafts[sessionId]');
  });
});
