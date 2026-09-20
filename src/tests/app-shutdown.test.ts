import { describe, expect, it, vi } from 'vitest';
import {
  SHUTDOWN_CLEANUP_TIMEOUT_MS,
  decideBeforeQuitAction,
  runShutdownAndQuit,
} from '../main/app-shutdown';

describe('decideBeforeQuitAction', () => {
  it('lets the final re-issued quit through once cleanup finished', () => {
    expect(
      decideBeforeQuitAction({ quitReady: true, isCleaningUp: true, isDev: false })
    ).toBe('allow');
  });

  it('uses the fast path in dev instead of async sandbox cleanup', () => {
    expect(
      decideBeforeQuitAction({ quitReady: false, isCleaningUp: false, isDev: true })
    ).toBe('dev-fast-exit');
  });

  it('defers a second Cmd+Q received while cleanup is still running', () => {
    expect(
      decideBeforeQuitAction({ quitReady: false, isCleaningUp: true, isDev: false })
    ).toBe('wait');
  });

  it('starts cleanup on the first production quit without requiring a pre-set flag', () => {
    expect(
      decideBeforeQuitAction({ quitReady: false, isCleaningUp: false, isDev: false })
    ).toBe('start-cleanup');
  });
});

describe('runShutdownAndQuit', () => {
  it('runs cleanup, then marks quit ready, then issues the real quit', async () => {
    const order: string[] = [];

    await runShutdownAndQuit({
      cleanup: async () => {
        order.push('cleanup');
      },
      quit: () => {
        order.push('quit');
      },
      withTimeout: async (operation) => operation,
      onError: () => {
        order.push('error');
      },
      markQuitReady: () => {
        order.push('ready');
      },
    });

    expect(order).toEqual(['cleanup', 'ready', 'quit']);
  });

  it('still marks ready and quits when cleanup fails, so Cmd+Q cannot strand the app', async () => {
    const order: string[] = [];
    const onError = vi.fn();

    await runShutdownAndQuit({
      cleanup: async () => {
        throw new Error('sandbox hung');
      },
      quit: () => {
        order.push('quit');
      },
      withTimeout: async (operation) => operation,
      onError: (error) => {
        onError(error);
        order.push('error');
      },
      markQuitReady: () => {
        order.push('ready');
      },
    });

    expect(onError).toHaveBeenCalledOnce();
    expect(order).toEqual(['error', 'ready', 'quit']);
  });

  it('bounds cleanup with the shutdown timeout label', async () => {
    const withTimeout = vi.fn(async <T>(operation: Promise<T>) => operation);

    await runShutdownAndQuit({
      cleanup: async () => undefined,
      quit: () => undefined,
      withTimeout,
      onError: () => undefined,
      markQuitReady: () => undefined,
    });

    expect(withTimeout).toHaveBeenCalledWith(
      expect.any(Promise),
      SHUTDOWN_CLEANUP_TIMEOUT_MS,
      'Shutdown cleanup'
    );
  });
});
