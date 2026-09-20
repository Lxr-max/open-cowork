/**
 * Quit/shutdown coordination for the Electron main process.
 *
 * `before-quit` and `cleanupSandboxResources()` must not share one "in progress"
 * flag. If the handler sets `isCleaningUp` before calling cleanup, cleanup's own
 * guard returns immediately — sandbox sync-back is skipped and Cmd+Q needs a
 * second press (OpenCoworkAI/open-cowork#297).
 */

export const SHUTDOWN_CLEANUP_TIMEOUT_MS = 60_000;

export type BeforeQuitAction = 'allow' | 'dev-fast-exit' | 'wait' | 'start-cleanup';

export function decideBeforeQuitAction(options: {
  quitReady: boolean;
  isCleaningUp: boolean;
  isDev: boolean;
}): BeforeQuitAction {
  if (options.quitReady) {
    return 'allow';
  }
  if (options.isDev) {
    return 'dev-fast-exit';
  }
  if (options.isCleaningUp) {
    return 'wait';
  }
  return 'start-cleanup';
}

export async function runShutdownAndQuit(options: {
  cleanup: () => Promise<void>;
  quit: () => void;
  withTimeout: <T>(operation: Promise<T>, timeoutMs: number, label: string) => Promise<T>;
  onError: (error: unknown) => void;
  markQuitReady: () => void;
  timeoutMs?: number;
}): Promise<void> {
  try {
    await options.withTimeout(
      options.cleanup(),
      options.timeoutMs ?? SHUTDOWN_CLEANUP_TIMEOUT_MS,
      'Shutdown cleanup'
    );
  } catch (error) {
    options.onError(error);
  }
  options.markQuitReady();
  options.quit();
}
