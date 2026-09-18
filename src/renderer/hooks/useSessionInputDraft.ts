import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useAppStore } from '../store';

function readDraft(sessionId: string | null): string {
  if (!sessionId) return '';
  return useAppStore.getState().sessionInputDrafts[sessionId] ?? '';
}

function writeDraft(sessionId: string | null, value: string): void {
  if (!sessionId) return;
  useAppStore.getState().setSessionInputDraft(sessionId, value);
}

export function useSessionInputDraft(sessionId: string | null): [string, (value: string) => void] {
  const [prompt, setPromptState] = useState(() => readDraft(sessionId));
  const sessionIdRef = useRef(sessionId);
  const promptRef = useRef(prompt);
  promptRef.current = prompt;

  useLayoutEffect(() => {
    const previousId = sessionIdRef.current;
    if (previousId && previousId !== sessionId) {
      writeDraft(previousId, promptRef.current);
    }
    sessionIdRef.current = sessionId;
    setPromptState(readDraft(sessionId));
  }, [sessionId]);

  useEffect(() => {
    return () => {
      writeDraft(sessionIdRef.current, promptRef.current);
    };
  }, []);

  const setPrompt = useCallback((value: string) => {
    promptRef.current = value;
    setPromptState(value);
    writeDraft(sessionIdRef.current, value);
  }, []);

  return [prompt, setPrompt];
}
