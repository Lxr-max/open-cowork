export type SandboxToolBackend =
  | { kind: 'host'; path: null }
  | { kind: 'lima'; path: string }
  | { kind: 'wsl'; path: string; distro: string };

/**
 * Pick the tool backend for one agent run.
 *
 * A WSL or Lima sandbox path is not a host path. Returning `host` with that
 * path makes bash fail with "Working directory does not exist". When isolation
 * was requested but no guest backend is available, stay on the host directory.
 */
export function selectSandboxToolBackend(input: {
  useSandboxIsolation: boolean;
  sandboxPath: string | null;
  isLima: boolean;
  isWSL: boolean;
  wslDistro?: string;
}): SandboxToolBackend {
  if (!input.useSandboxIsolation || !input.sandboxPath) {
    return { kind: 'host', path: null };
  }
  if (input.isLima) {
    return { kind: 'lima', path: input.sandboxPath };
  }
  if (input.isWSL && input.wslDistro) {
    return { kind: 'wsl', path: input.sandboxPath, distro: input.wslDistro };
  }
  return { kind: 'host', path: null };
}
