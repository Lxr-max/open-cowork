import type { Message, Session } from '../types';
import { useAppStore } from '../store';

export async function getSessionExportMessages(
  sessionId: string,
  isElectron: boolean,
  getPersistedMessages: (sessionId: string) => Promise<Message[]>
): Promise<Message[] | null> {
  const before = useAppStore.getState();
  if (!isElectron) return before.sessionStates[sessionId]?.messages ?? [];

  const ready = (state: typeof before) =>
    state.sessions.some((session) => session.id === sessionId && session.status !== 'running') &&
    !state.sessionStates[sessionId]?.activeTurn &&
    !state.sessionStates[sessionId]?.pendingTurns.length &&
    !state.sessionStates[sessionId]?.messages.some((message) => message.localStatus === 'queued');

  if (!ready(before)) return null;

  const sessionBefore = before.sessions.find((session) => session.id === sessionId);
  const messages = await getPersistedMessages(sessionId);
  const after = useAppStore.getState();
  // A new message or status change can make the persisted snapshot stale during IPC.
  if (
    !ready(after) ||
    sessionBefore !== after.sessions.find((session) => session.id === sessionId) ||
    before.sessionStates[sessionId]?.messages !== after.sessionStates[sessionId]?.messages
  ) {
    return null;
  }
  return messages;
}

export function createSessionExport(session: Session, messages: Message[]) {
  const data = {
    format: 'open-cowork-session',
    version: 1,
    session,
    messages,
  };

  return {
    filename: `open-cowork-session-${session.id}.json`,
    blob: new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' }),
  };
}
