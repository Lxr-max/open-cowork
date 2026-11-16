/**
 * Coding tools that run inside an existing WSL2 distro.
 *
 * The sandbox directory is created inside the distro (`~/.claude/sandbox/...`).
 * Host bash on Windows cannot use that path as its working directory, so these
 * tools have to be the ones the agent session keeps. The app does not download
 * a separate VM image. WSL still mounts Windows drives under `/mnt`, and GUI
 * actions stay on the host.
 */
import { spawn, type ChildProcess, type SpawnOptions } from 'child_process';
import { randomUUID } from 'crypto';
import type { BashOperations } from '@mariozechner/pi-coding-agent';
import {
  buildLimaGuestShellScript,
  createGuestCodingTools,
  createPosixGuestFileOperations,
  readGuestStdout,
  spawnGuestScript,
  type CheckedGuestScript,
} from './lima-sandbox-operations';
import { wslBytesToUtf8 } from '../sandbox/wsl-detection';

type SpawnProcess = (command: string, args: string[], options: SpawnOptions) => ChildProcess;

export interface WslSandboxOperationsOptions {
  spawnProcess?: SpawnProcess;
  distro: string;
}

function defaultSpawn(command: string, args: string[], options: SpawnOptions): ChildProcess {
  return spawn(command, args, options);
}

/** Without this, piped wsl.exe re-encodes guest stdout as UTF-16LE. */
function wslGuestEnv(env?: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  return { ...env, WSL_UTF8: '1' };
}

export function assertWslDistroName(distro: string): string {
  if (!/^[A-Za-z0-9._-]+$/.test(distro)) {
    throw new Error(`Invalid WSL distro name: ${distro}`);
  }
  return distro;
}

/** Node installed by the app lives in nvm and is absent from a non-login PATH. */
export function buildWslGuestShellScript(
  cwd: string,
  command: string,
  sandboxPath: string
): string {
  return `source ~/.nvm/nvm.sh 2>/dev/null; ${buildLimaGuestShellScript(cwd, command, sandboxPath)}`;
}

function createWslRunner(options: WslSandboxOperationsOptions): CheckedGuestScript {
  const distro = assertWslDistroName(options.distro);
  const spawnProcess = options.spawnProcess ?? defaultSpawn;
  return async (script, stdin, checkedPath) => {
    const result = await spawnGuestScript(
      spawnProcess,
      'wsl',
      ['-d', distro, '-e', 'bash', '-c', script],
      { stdin, env: wslGuestEnv() }
    );
    return wslBytesToUtf8(readGuestStdout(result, checkedPath, 'WSL'));
  };
}

export function createWslSandboxBashOperations(
  sandboxPath: string,
  options: WslSandboxOperationsOptions
): BashOperations {
  const distro = assertWslDistroName(options.distro);
  const spawnProcess = options.spawnProcess ?? defaultSpawn;
  return {
    exec: (command, cwd, { onData, signal, timeout, env }) =>
      spawnGuestScript(
        spawnProcess,
        'wsl',
        ['-d', distro, '-e', 'bash', '-c', buildWslGuestShellScript(cwd, command, sandboxPath)],
        { onData, signal, timeoutSeconds: timeout, env: wslGuestEnv(env) }
      ).then(({ exitCode }) => ({ exitCode })),
  };
}

export function createWslSandboxFileOperations(
  sandboxPath: string,
  options: WslSandboxOperationsOptions
): ReturnType<typeof createPosixGuestFileOperations> {
  return createPosixGuestFileOperations(sandboxPath, createWslRunner(options));
}

export function createWslSandboxCodingTools(
  sandboxPath: string,
  options: WslSandboxOperationsOptions
): ReturnType<typeof createGuestCodingTools> {
  return createGuestCodingTools(
    sandboxPath,
    createWslSandboxFileOperations(sandboxPath, options),
    createWslSandboxBashOperations(sandboxPath, options),
    `cowork-wsl-${randomUUID()}`
  );
}
