import type { Message, Session } from '../types';

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
