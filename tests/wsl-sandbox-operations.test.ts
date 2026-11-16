import { EventEmitter } from 'events';
import { describe, expect, it, vi } from 'vitest';
import type { ChildProcess, SpawnOptions } from 'child_process';
import {
  buildWslGuestShellScript,
  createWslSandboxBashOperations,
  createWslSandboxCodingTools,
  createWslSandboxFileOperations,
} from '../src/main/agent/wsl-sandbox-operations';

const SANDBOX = '/home/user/.claude/sandbox/session-1';

class FakeChildProcess extends EventEmitter {
  stdout = new EventEmitter();
  stderr = new EventEmitter();
  stdin = Object.assign(new EventEmitter(), {
    write: vi.fn(),
    end: vi.fn(),
  });
  kill = vi.fn();
}

function createSpawnMock(children: FakeChildProcess[]) {
  return vi.fn((command: string, args: string[], _options: SpawnOptions) => {
    const child = children.shift();
    if (!child) throw new Error(`Unexpected spawn: ${command} ${args.join(' ')}`);
    return Object.assign(child, {
      spawnargs: [command, ...args],
      spawnfile: command,
    }) as unknown as ChildProcess;
  });
}

describe('WSL sandbox commands', () => {
  it('builds a guest script that loads nvm and enters the sandbox directory', () => {
    const script = buildWslGuestShellScript('/workspace', 'pwd', SANDBOX);
    expect(script.startsWith('source ~/.nvm/nvm.sh 2>/dev/null; ')).toBe(true);
    expect(script).toContain(`cd -- '${SANDBOX}'`);
    expect(script.endsWith('pwd')).toBe(true);
  });

  it('runs bash through wsl without a Windows shell', async () => {
    const child = new FakeChildProcess();
    const spawnProcess = createSpawnMock([child]);
    const operations = createWslSandboxBashOperations(SANDBOX, {
      distro: 'Ubuntu-24.04',
      spawnProcess,
    });
    const pending = operations.exec('echo ok', '/workspace', { onData: vi.fn() });
    child.emit('close', 0);
    await expect(pending).resolves.toEqual({ exitCode: 0 });
    expect(spawnProcess).toHaveBeenCalledWith(
      'wsl',
      ['-d', 'Ubuntu-24.04', '-e', 'bash', '-c', expect.stringContaining(`cd -- '${SANDBOX}'`)],
      expect.objectContaining({
        stdio: ['ignore', 'pipe', 'pipe'],
        env: expect.objectContaining({ WSL_UTF8: '1' }),
      })
    );
    const script = String(spawnProcess.mock.calls[0][1].at(-1));
    expect(script).toContain('source ~/.nvm/nvm.sh');
    expect(script).not.toContain('Ubuntu-24.04;');
  });

  it('rejects a distro name that could change the wsl arguments', () => {
    expect(() => createWslSandboxBashOperations(SANDBOX, { distro: 'Ubuntu; rm -rf /' })).toThrow(
      'Invalid WSL distro name'
    );
  });

  it('reads a guest file through wsl and maps a missing file to ENOENT', async () => {
    const child = new FakeChildProcess();
    const spawnProcess = createSpawnMock([child]);
    const files = createWslSandboxFileOperations(SANDBOX, {
      distro: 'Ubuntu-24.04',
      spawnProcess,
    });
    const pending = files.read.readFile('/workspace/notes.txt');
    child.stdout.emit('data', Buffer.from('hello'));
    child.emit('close', 44);
    await expect(pending).rejects.toMatchObject({ code: 'ENOENT' });
    expect(spawnProcess.mock.calls[0][0]).toBe('wsl');
    expect(spawnProcess.mock.calls[0][1]).toEqual([
      '-d',
      'Ubuntu-24.04',
      '-e',
      'bash',
      '-c',
      expect.stringContaining(`'${SANDBOX}/notes.txt'`),
    ]);
    expect(spawnProcess.mock.calls[0][2]).toEqual(
      expect.objectContaining({ env: expect.objectContaining({ WSL_UTF8: '1' }) })
    );
  });

  it('decodes UTF-16LE file bytes written by a piped wsl.exe', async () => {
    const child = new FakeChildProcess();
    const spawnProcess = createSpawnMock([child]);
    const files = createWslSandboxFileOperations(SANDBOX, {
      distro: 'Ubuntu-24.04',
      spawnProcess,
    });
    const pending = files.read.readFile('/workspace/notes.txt');
    child.stdout.emit('data', Buffer.from('hello\n', 'utf16le'));
    child.emit('close', 0);
    await expect(pending).resolves.toEqual(Buffer.from('hello\n'));
  });

  it('keeps the WSL tool objects for the agent session override', () => {
    const spawnProcess = createSpawnMock([]);
    const tools = createWslSandboxCodingTools(SANDBOX, {
      distro: 'Ubuntu-24.04',
      spawnProcess,
    });
    expect(tools.map((tool) => tool.name)).toEqual(['read', 'bash', 'edit', 'write']);
  });
});
