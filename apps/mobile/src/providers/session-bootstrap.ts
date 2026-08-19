export const SESSION_BOOTSTRAP_TIMEOUT_MS = 12_000;

export type StartupErrorCategory =
  | 'storage_unavailable'
  | 'session_unavailable'
  | 'context_unavailable'
  | 'malformed_session_context'
  | 'startup_timeout'
  | 'local_clear_failed'
  | 'startup_unavailable';

export type LocalSessionStatus = 'unknown' | 'absent' | 'present' | 'cleared';

export type SessionBootstrapOutcome<SessionValue, ContextValue> =
  | {
      status: 'unauthenticated';
      session: null;
      context: null;
      localSessionStatus: 'absent';
    }
  | {
      status: 'authenticated';
      session: SessionValue;
      context: ContextValue;
      localSessionStatus: 'present';
    }
  | {
      status: 'error';
      category: Exclude<StartupErrorCategory, 'local_clear_failed'>;
      session: SessionValue | null;
      context: null;
      localSessionStatus: 'unknown' | 'present';
    };

interface SessionBootstrapDependencies<SessionValue, ContextValue> {
  getSession: () => Promise<{
    data: { session: SessionValue | null };
    error: unknown;
  }>;
  getSessionContext: () => Promise<{ data: unknown; error: unknown }>;
  parseContext: (value: unknown) => ContextValue;
  isStorageError: (error: unknown) => boolean;
  timeoutMs?: number;
}

export type BoundedOperationResult<Value> =
  | { timedOut: false; value: Value }
  | { timedOut: true };

export async function runBoundedOperation<Value>(
  operation: () => Promise<Value>,
  timeoutMs: number,
): Promise<BoundedOperationResult<Value>> {
  let timeout: ReturnType<typeof setTimeout> | undefined;
  const operationPromise = Promise.resolve().then(operation);
  const timeoutPromise = new Promise<BoundedOperationResult<Value>>((resolve) => {
    timeout = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
  });
  try {
    return await Promise.race([
      operationPromise.then((value) => ({ timedOut: false, value }) as const),
      timeoutPromise,
    ]);
  } finally {
    if (timeout !== undefined) clearTimeout(timeout);
  }
}

async function bootstrapWithoutTimeout<SessionValue, ContextValue>(
  dependencies: SessionBootstrapDependencies<SessionValue, ContextValue>,
): Promise<SessionBootstrapOutcome<SessionValue, ContextValue>> {
  let sessionResult: Awaited<ReturnType<typeof dependencies.getSession>>;
  try {
    sessionResult = await dependencies.getSession();
  } catch (error) {
    return {
      status: 'error',
      category: dependencies.isStorageError(error)
        ? 'storage_unavailable'
        : 'session_unavailable',
      session: null,
      context: null,
      localSessionStatus: 'unknown',
    };
  }

  if (sessionResult.error) {
    return {
      status: 'error',
      category: dependencies.isStorageError(sessionResult.error)
        ? 'storage_unavailable'
        : 'session_unavailable',
      session: null,
      context: null,
      localSessionStatus: 'unknown',
    };
  }

  const session = sessionResult.data.session;
  if (!session) {
    return {
      status: 'unauthenticated',
      session: null,
      context: null,
      localSessionStatus: 'absent',
    };
  }

  let contextResult: Awaited<ReturnType<typeof dependencies.getSessionContext>>;
  try {
    contextResult = await dependencies.getSessionContext();
  } catch {
    return {
      status: 'error',
      category: 'context_unavailable',
      session,
      context: null,
      localSessionStatus: 'present',
    };
  }

  if (contextResult.error) {
    return {
      status: 'error',
      category: 'context_unavailable',
      session,
      context: null,
      localSessionStatus: 'present',
    };
  }

  try {
    return {
      status: 'authenticated',
      session,
      context: dependencies.parseContext(contextResult.data),
      localSessionStatus: 'present',
    };
  } catch {
    return {
      status: 'error',
      category: 'malformed_session_context',
      session,
      context: null,
      localSessionStatus: 'present',
    };
  }
}

export async function runSessionBootstrap<SessionValue, ContextValue>(
  dependencies: SessionBootstrapDependencies<SessionValue, ContextValue>,
): Promise<SessionBootstrapOutcome<SessionValue, ContextValue>> {
  const result = await runBoundedOperation(
    () => bootstrapWithoutTimeout(dependencies),
    dependencies.timeoutMs ?? SESSION_BOOTSTRAP_TIMEOUT_MS,
  );
  if (result.timedOut) {
    return {
      status: 'error',
      category: 'startup_timeout',
      session: null,
      context: null,
      localSessionStatus: 'unknown',
    };
  }
  return result.value;
}

export type StartupSurface = 'loading' | 'recovery' | 'public' | 'authenticated';

export function startupSurfaceFor(state: {
  loading: boolean;
  startupError: StartupErrorCategory | null;
  session: unknown;
}): StartupSurface {
  if (state.loading) return 'loading';
  if (state.startupError) return 'recovery';
  return state.session ? 'authenticated' : 'public';
}

interface SerialTaskContext {
  isLatest: () => boolean;
}

export class LatestSerialExecutor {
  private latestGeneration = 0;
  private tail: Promise<void> = Promise.resolve();

  enqueue<Value>(task: (context: SerialTaskContext) => Promise<Value>): Promise<Value> {
    const generation = ++this.latestGeneration;
    const result = this.tail
      .catch(() => undefined)
      .then(() => task({ isLatest: () => generation === this.latestGeneration }));
    this.tail = result.then(
      () => undefined,
      () => undefined,
    );
    return result;
  }

  invalidate(): void {
    this.latestGeneration += 1;
  }
}

type SafeStartupLogger = (
  event: 'SESSION_BOOTSTRAP_RECOVERY',
  metadata: Readonly<{ category: StartupErrorCategory }>,
) => void;

const defaultStartupLogger: SafeStartupLogger = (event, metadata) => {
  console.warn(event, metadata);
};

export function reportSessionBootstrapError(
  category: StartupErrorCategory,
  logger: SafeStartupLogger = defaultStartupLogger,
): void {
  logger('SESSION_BOOTSTRAP_RECOVERY', { category });
}
