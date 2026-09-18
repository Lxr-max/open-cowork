import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const sidebarPath = path.resolve(process.cwd(), 'src/renderer/components/Sidebar.tsx');
const sidebarSource = readFileSync(sidebarPath, 'utf8');
const enPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/en.json');
const zhPath = path.resolve(process.cwd(), 'src/renderer/i18n/locales/zh.json');

describe('Sidebar single-session delete confirmation', () => {
  it('asks for confirmation before deleting a conversation', () => {
    const confirmIndex = sidebarSource.indexOf(
      "window.confirm(t('sidebar.deleteConfirm', { title: session?.title ?? '' }))"
    );
    const deleteIndex = sidebarSource.indexOf('deleteSession(sessionId);');

    expect(confirmIndex).toBeGreaterThan(-1);
    expect(deleteIndex).toBeGreaterThan(confirmIndex);
    expect(sidebarSource).toContain("if (!window.confirm(t('sidebar.deleteConfirm'");
  });

  it('does not delete when the user cancels the confirm dialog', () => {
    expect(sidebarSource).toContain(
      "if (!window.confirm(t('sidebar.deleteConfirm', { title: session?.title ?? '' }))) return;"
    );
  });

  it('defines delete confirmation copy in both locales', () => {
    const en = JSON.parse(readFileSync(enPath, 'utf8')) as {
      sidebar: { deleteConfirm: string };
    };
    const zh = JSON.parse(readFileSync(zhPath, 'utf8')) as {
      sidebar: { deleteConfirm: string };
    };

    expect(en.sidebar.deleteConfirm).toContain('{{title}}');
    expect(zh.sidebar.deleteConfirm).toContain('{{title}}');
  });
});
