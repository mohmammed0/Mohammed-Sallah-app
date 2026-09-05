export const SCANNER_ATTEMPT_MAX_DURATION_MS = 120_000;

export type DeadlineErrorCode = 'attempt_deadline_expired' | 'invalid_attempt_deadline';

export class DeadlineError extends Error {
  override readonly name = 'DeadlineError';

  constructor(readonly code: DeadlineErrorCode) {
    super(code);
  }
}

export interface AttemptDeadlineOptions {
  readonly processingDeadline: string;
  readonly nowMs?: () => number;
  readonly monotonicMs?: () => number;
  readonly setTimer?: (handler: () => void, delayMs: number) => NodeJS.Timeout;
  readonly clearTimer?: (timer: NodeJS.Timeout) => void;
}

function fail(code: DeadlineErrorCode): DeadlineError {
  return new DeadlineError(code);
}

export class AttemptDeadline {
  readonly #abortController = new AbortController();
  readonly #clearTimer: (timer: NodeJS.Timeout) => void;
  readonly #monotonicDeadline: number;
  readonly #monotonicMs: () => number;
  readonly #timer: NodeJS.Timeout;
  readonly #wallDeadline: number;
  readonly #nowMs: () => number;
  readonly #startedMonotonic: number;

  constructor(options: AttemptDeadlineOptions) {
    this.#nowMs = options.nowMs ?? Date.now;
    this.#monotonicMs = options.monotonicMs ?? (() => performance.now());
    this.#clearTimer = options.clearTimer ?? clearTimeout;
    const now = this.#nowMs();
    const parsed = Date.parse(options.processingDeadline);
    const wallRemaining = parsed - now;
    if (!Number.isFinite(parsed) || wallRemaining > SCANNER_ATTEMPT_MAX_DURATION_MS) {
      throw fail('invalid_attempt_deadline');
    }
    if (wallRemaining <= 0) throw fail('attempt_deadline_expired');
    this.#wallDeadline = parsed;
    this.#startedMonotonic = this.#monotonicMs();
    if (!Number.isFinite(this.#startedMonotonic)) throw fail('invalid_attempt_deadline');
    this.#monotonicDeadline = this.#startedMonotonic + wallRemaining;
    const schedule = options.setTimer ?? setTimeout;
    this.#timer = schedule(
      () => this.#abortController.abort(fail('attempt_deadline_expired')),
      wallRemaining,
    );
  }

  get signal(): AbortSignal {
    return this.#abortController.signal;
  }

  get processingDeadline(): string {
    return new Date(this.#wallDeadline).toISOString();
  }

  remainingMs(): number {
    if (this.signal.aborted) return 0;
    return Math.max(
      0,
      Math.min(this.#wallDeadline - this.#nowMs(), this.#monotonicDeadline - this.#monotonicMs()),
    );
  }

  elapsedMs(): number {
    return Math.max(0, Math.floor(this.#monotonicMs() - this.#startedMonotonic));
  }

  assertActive(): void {
    if (this.signal.aborted || this.remainingMs() <= 0) {
      if (!this.signal.aborted) this.#abortController.abort(fail('attempt_deadline_expired'));
      throw fail('attempt_deadline_expired');
    }
  }

  dispose(): void {
    this.#clearTimer(this.#timer);
  }
}
