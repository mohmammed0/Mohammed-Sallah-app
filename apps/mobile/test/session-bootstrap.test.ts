import { describe, expect, it, vi } from 'vitest';
import {
  LatestSerialExecutor,
  reportSessionBootstrapError,
  runSessionBootstrap,
  startupSurfaceFor,
} from '../src/providers/session-bootstrap';

const noContext = async () => ({ data: null, error: null });

describe('session bootstrap recovery', () => {
  it('routes a fresh install with no session to the public auth surface', async () => {
    const outcome = await runSessionBootstrap({
      getSession: async () => ({ data: { session: null }, error: null }),
      getSessionContext: noContext,
      parseContext: (value) => value,
      isStorageError: () => false,
    });
    expect(outcome).toEqual({
      status: 'unauthenticated',
      session: null,
      context: null,
      localSessionStatus: 'absent',
    });
    expect(
      startupSurfaceFor({
        loading: false,
        startupError: null,
        session: outcome.session,
      }),
    ).toBe('public');
  });

  it('turns a SecureStore read rejection into a recoverable terminal state', async () => {
    const storageFailure = { storage: true };
    const outcome = await runSessionBootstrap({
      getSession: async () => {
        throw storageFailure;
      },
      getSessionContext: noContext,
      parseContext: (value) => value,
      isStorageError: (error) => error === storageFailure,
    });
    expect(outcome).toMatchObject({
      status: 'error',
      category: 'storage_unavailable',
      localSessionStatus: 'unknown',
    });
    expect(
      startupSurfaceFor({
        loading: false,
        startupError: 'storage_unavailable',
        session: null,
      }),
    ).toBe('recovery');
  });

  it('restores a valid stored session and authoritative context', async () => {
    const session = { access_token: 'not-logged', user: { id: 'user-id' } };
    const context = { authenticated: true, allowed: true, roles: ['customer'] };
    const outcome = await runSessionBootstrap({
      getSession: async () => ({ data: { session }, error: null }),
      getSessionContext: async () => ({ data: context, error: null }),
      parseContext: (value) => value as typeof context,
      isStorageError: () => false,
    });
    expect(outcome).toEqual({
      status: 'authenticated',
      session,
      context,
      localSessionStatus: 'present',
    });
  });

  it('distinguishes get_session_context failure from storage failure', async () => {
    const session = { access_token: 'not-logged' };
    const outcome = await runSessionBootstrap({
      getSession: async () => ({ data: { session }, error: null }),
      getSessionContext: async () => ({
        data: null,
        error: { message: 'network unavailable' },
      }),
      parseContext: (value) => value,
      isStorageError: () => false,
    });
    expect(outcome).toMatchObject({
      status: 'error',
      category: 'context_unavailable',
      session,
      localSessionStatus: 'present',
    });
  });

  it('blocks malformed session context instead of leaving loading active', async () => {
    const outcome = await runSessionBootstrap({
      getSession: async () => ({
        data: { session: { access_token: 'not-logged' } },
        error: null,
      }),
      getSessionContext: async () => ({ data: { invalid: true }, error: null }),
      parseContext: () => {
        throw new Error('invalid context');
      },
      isStorageError: () => false,
    });
    expect(outcome).toMatchObject({
      status: 'error',
      category: 'malformed_session_context',
      localSessionStatus: 'present',
    });
  });

  it('ends the startup window with recovery UI after the bounded timeout', async () => {
    vi.useFakeTimers();
    try {
      const outcomePromise = runSessionBootstrap({
        getSession: () => new Promise<never>(() => undefined),
        getSessionContext: noContext,
        parseContext: (value) => value,
        isStorageError: () => false,
        timeoutMs: 25,
      });
      await vi.advanceTimersByTimeAsync(25);
      const outcome = await outcomePromise;
      expect(outcome).toMatchObject({
        status: 'error',
        category: 'startup_timeout',
        localSessionStatus: 'unknown',
      });
      expect(
        startupSurfaceFor({
          loading: false,
          startupError: 'startup_timeout',
          session: null,
        }),
      ).toBe('recovery');
    } finally {
      vi.useRealTimers();
    }
  });

  it('Retry performs a new bounded attempt without requiring a restart', async () => {
    vi.useFakeTimers();
    try {
      let attempts = 0;
      const dependencies = {
        getSession: () => {
          attempts += 1;
          return attempts === 1
            ? new Promise<never>(() => undefined)
            : Promise.resolve({ data: { session: null }, error: null });
        },
        getSessionContext: noContext,
        parseContext: (value: unknown) => value,
        isStorageError: () => false,
        timeoutMs: 25,
      };
      const firstAttempt = runSessionBootstrap(dependencies);
      await vi.advanceTimersByTimeAsync(25);
      await expect(firstAttempt).resolves.toMatchObject({
        status: 'error',
        category: 'startup_timeout',
      });
      await expect(runSessionBootstrap(dependencies)).resolves.toMatchObject({
        status: 'unauthenticated',
      });
      expect(attempts).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it('serializes startup and auth-state refreshes and ignores stale results', async () => {
    const executor = new LatestSerialExecutor();
    let resolveFirst: (() => void) | undefined;
    let active = 0;
    let maximumActive = 0;
    const commits: string[] = [];

    const first = executor.enqueue(async ({ isLatest }) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await new Promise<void>((resolve) => {
        resolveFirst = resolve;
      });
      active -= 1;
      if (isLatest()) commits.push('startup');
      return 'first';
    });

    const second = executor.enqueue(async ({ isLatest }) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      active -= 1;
      if (isLatest()) commits.push('auth-state');
      return 'second';
    });

    await Promise.resolve();
    await Promise.resolve();
    expect(active).toBe(1);
    resolveFirst?.();
    await expect(Promise.all([first, second])).resolves.toEqual(['first', 'second']);
    expect(maximumActive).toBe(1);
    expect(commits).toEqual(['auth-state']);
  });

  it('logs only a privacy-safe category and never a token or session value', () => {
    const logger = vi.fn();
    reportSessionBootstrapError('storage_unavailable', logger);
    expect(logger).toHaveBeenCalledWith('SESSION_BOOTSTRAP_RECOVERY', {
      category: 'storage_unavailable',
    });
    const serialized = JSON.stringify(logger.mock.calls);
    expect(serialized).not.toContain('access_token');
    expect(serialized).not.toContain('refresh_token');
    expect(serialized).not.toContain('session-value');
  });
});
