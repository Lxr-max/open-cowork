import { describe, expect, it } from 'vitest';
import { selectSandboxToolBackend } from '../src/main/agent/sandbox-tool-backend';

const GUEST = '/home/user/.claude/sandbox/session-1';

describe('selectSandboxToolBackend', () => {
  it('keeps host tools when sandbox isolation is off', () => {
    expect(
      selectSandboxToolBackend({
        useSandboxIsolation: false,
        sandboxPath: GUEST,
        isLima: false,
        isWSL: true,
        wslDistro: 'Ubuntu-24.04',
      })
    ).toEqual({ kind: 'host', path: null });
  });

  it('runs inside WSL when the distro and sandbox path are known', () => {
    expect(
      selectSandboxToolBackend({
        useSandboxIsolation: true,
        sandboxPath: GUEST,
        isLima: false,
        isWSL: true,
        wslDistro: 'Ubuntu-24.04',
      })
    ).toEqual({ kind: 'wsl', path: GUEST, distro: 'Ubuntu-24.04' });
  });

  it('does not point host tools at a guest path when the WSL distro is missing', () => {
    expect(
      selectSandboxToolBackend({
        useSandboxIsolation: true,
        sandboxPath: GUEST,
        isLima: false,
        isWSL: true,
      })
    ).toEqual({ kind: 'host', path: null });
  });

  it('keeps the Lima guest path for macOS isolation', () => {
    expect(
      selectSandboxToolBackend({
        useSandboxIsolation: true,
        sandboxPath: GUEST,
        isLima: true,
        isWSL: false,
      })
    ).toEqual({ kind: 'lima', path: GUEST });
  });
});
