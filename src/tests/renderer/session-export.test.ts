import { describe, expect, it } from 'vitest';
import { createSessionExport } from '../../renderer/utils/session-export';
import type { Message, Session } from '../../renderer/types';

describe('createSessionExport', () => {
  it('keeps the selected conversation and its structured attachments in JSON', async () => {
    const session: Session = {
      id: 'session-1',
      title: '课件讨论',
      status: 'completed',
      mountedPaths: [],
      allowedTools: [],
      memoryEnabled: false,
      createdAt: 100,
      updatedAt: 200,
    };
    const messages: Message[] = [
      {
        id: 'message-1',
        sessionId: session.id,
        role: 'user',
        timestamp: 150,
        content: [
          { type: 'text', text: '请看这张图' },
          { type: 'image', source: { type: 'base64', media_type: 'image/png', data: 'aGVsbG8=' } },
          {
            type: 'file_attachment',
            filename: 'notes.txt',
            relativePath: 'notes.txt',
            size: 5,
            inlineDataBase64: 'aGVsbG8=',
          },
        ],
      },
    ];

    const { filename, blob } = createSessionExport(session, messages);
    expect(filename).toBe('open-cowork-session-session-1.json');
    expect(blob.type).toBe('application/json');
    expect(JSON.parse(await blob.text())).toEqual({
      format: 'open-cowork-session',
      version: 1,
      session,
      messages,
    });
  });
});
