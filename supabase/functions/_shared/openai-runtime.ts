export const OPENAI_MAX_ATTEMPTS = 2 as const;
export const DEFAULT_OPENAI_DIAGNOSTIC_MODEL = 'gpt-5.6-terra' as const;
export const DEFAULT_OPENAI_TRANSLATION_MODEL = 'gpt-5.6-luna' as const;
export const DEFAULT_OPENAI_TRANSCRIPTION_MODEL = 'gpt-transcribe' as const;
export const OPENAI_DIAGNOSTIC_DEADLINE_MS = 30_000 as const;
export const OPENAI_TRANSCRIPTION_DEADLINE_MS = 45_000 as const;
export const OPENAI_TRANSLATION_DEADLINE_MS = 20_000 as const;
export const OPENAI_DIAGNOSTIC_MAX_OUTPUT_TOKENS = 1_200 as const;
export const OPENAI_TRANSLATION_MAX_OUTPUT_TOKENS = 800 as const;

export type OpenAiOperation = 'diagnostic' | 'transcription' | 'translation';
export type OpenAiErrorCategory =
  | 'timeout'
  | 'rate_limit'
  | 'quota_required'
  | 'server_error'
  | 'request_rejected'
  | 'unavailable';

export interface OpenAiRequestOptions {
  timeout: number;
  maxRetries: 0;
  signal: AbortSignal;
}

export interface OpenAiUsage {
  inputUnits: number;
  outputUnits: number;
}

export interface OpenAiCallResult<T> extends OpenAiUsage {
  value: T;
  attempts: number;
  latencyMs: number;
}

export class OpenAiCallError extends Error {
  readonly category: OpenAiErrorCategory;
  readonly attempts: number;
  readonly retryable: boolean;
  readonly statusClass: 'none' | '4xx' | '5xx';

  constructor(
    category: OpenAiErrorCategory,
    attempts: number,
    retryable: boolean,
    statusClass: 'none' | '4xx' | '5xx',
  ) {
    const code = category === 'timeout'
      ? 'OPENAI_TIMEOUT'
      : category === 'rate_limit'
      ? 'OPENAI_RATE_LIMITED'
      : category === 'quota_required'
      ? 'OPENAI_QUOTA_REQUIRED'
      : category === 'request_rejected'
      ? 'OPENAI_REQUEST_REJECTED'
      : 'OPENAI_UNAVAILABLE';
    super(code);
    this.name = 'OpenAiCallError';
    this.category = category;
    this.attempts = attempts;
    this.retryable = retryable;
    this.statusClass = statusClass;
  }
}

export class OpenAiResponseError extends Error implements OpenAiUsage {
  readonly category = 'invalid_response' as const;
  readonly attempts: number;
  readonly latencyMs: number;
  readonly inputUnits: number;
  readonly outputUnits: number;

  constructor(
    telemetry: Pick<
      OpenAiCallResult<unknown>,
      'attempts' | 'latencyMs' | 'inputUnits' | 'outputUnits'
    >,
  ) {
    super('OPENAI_INVALID_RESPONSE');
    this.name = 'OpenAiResponseError';
    this.attempts = telemetry.attempts;
    this.latencyMs = telemetry.latencyMs;
    this.inputUnits = telemetry.inputUnits;
    this.outputUnits = telemetry.outputUnits;
  }
}

class AttemptDeadlineError extends Error {
  constructor() {
    super('OPENAI_ATTEMPT_DEADLINE');
    this.name = 'AttemptDeadlineError';
  }
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

function statusClass(status: number | null): 'none' | '4xx' | '5xx' {
  if (status !== null && status >= 400 && status <= 499) return '4xx';
  if (status !== null && status >= 500 && status <= 599) return '5xx';
  return 'none';
}

function classify(error: unknown): {
  category: OpenAiErrorCategory;
  retryable: boolean;
  statusClass: 'none' | '4xx' | '5xx';
} {
  if (error instanceof AttemptDeadlineError) {
    return { category: 'timeout', retryable: true, statusClass: 'none' };
  }
  const candidate = record(error);
  const name = candidate && typeof candidate.name === 'string' ? candidate.name : '';
  const rawStatus = candidate?.status;
  const status = typeof rawStatus === 'number' && Number.isInteger(rawStatus) ? rawStatus : null;
  const responseClass = statusClass(status);
  const nestedError = record(candidate?.error);
  const providerCode = typeof candidate?.code === 'string'
    ? candidate.code
    : typeof nestedError?.code === 'string'
    ? nestedError.code
    : '';
  if (name === 'APIConnectionTimeoutError' || name === 'TimeoutError') {
    return { category: 'timeout', retryable: true, statusClass: responseClass };
  }
  if (status === 408) {
    return { category: 'timeout', retryable: true, statusClass: responseClass };
  }
  if (status === 429) {
    if (
      ['insufficient_quota', 'billing_not_active', 'billing_hard_limit_reached'].includes(
        providerCode,
      )
    ) {
      return { category: 'quota_required', retryable: false, statusClass: responseClass };
    }
    return { category: 'rate_limit', retryable: true, statusClass: responseClass };
  }
  if (status !== null && status >= 500 && status <= 599) {
    return { category: 'server_error', retryable: true, statusClass: responseClass };
  }
  if (status !== null && status >= 400 && status <= 499) {
    return { category: 'request_rejected', retryable: false, statusClass: responseClass };
  }
  return { category: 'unavailable', retryable: false, statusClass: responseClass };
}

function safeUnit(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 &&
      value <= 2_147_483_647
    ? value
    : null;
}

export function extractResponseUsage(response: unknown): OpenAiUsage {
  const usage = record(record(response)?.usage);
  const inputUnits = safeUnit(usage?.input_tokens);
  const outputUnits = safeUnit(usage?.output_tokens);
  return inputUnits === null || outputUnits === null
    ? { inputUnits: 0, outputUnits: 0 }
    : { inputUnits, outputUnits };
}

async function invokeWithDeadline<T>(
  invoke: (options: OpenAiRequestOptions) => Promise<T>,
  timeout: number,
): Promise<T> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_resolve, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new AttemptDeadlineError());
    }, timeout);
  });
  try {
    return await Promise.race([
      Promise.resolve().then(() => invoke({ timeout, maxRetries: 0, signal: controller.signal })),
      deadline,
    ]);
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export async function callOpenAi<T>(
  invoke: (options: OpenAiRequestOptions) => Promise<T>,
  options: {
    operation: OpenAiOperation;
    deadlineMs: number;
    retryDelayMs?: number;
  },
): Promise<OpenAiCallResult<T>> {
  if (
    !Number.isInteger(options.deadlineMs) || options.deadlineMs < 1 || options.deadlineMs > 60_000
  ) {
    throw new Error('OPENAI_DEADLINE_INVALID');
  }
  const retryDelayMs = options.retryDelayMs ?? 100;
  if (!Number.isInteger(retryDelayMs) || retryDelayMs < 0 || retryDelayMs > 1_000) {
    throw new Error('OPENAI_RETRY_DELAY_INVALID');
  }
  const started = performance.now();
  const deadlineAt = started + options.deadlineMs;
  let attempts = 0;
  while (attempts < OPENAI_MAX_ATTEMPTS) {
    attempts += 1;
    const now = performance.now();
    const attemptsRemaining = OPENAI_MAX_ATTEMPTS - attempts + 1;
    const remaining = Math.max(1, Math.floor(deadlineAt - now));
    const reservedDelay = retryDelayMs * Math.max(0, attemptsRemaining - 1);
    const attemptTimeout = Math.max(1, Math.floor((remaining - reservedDelay) / attemptsRemaining));
    try {
      const value = await invokeWithDeadline(invoke, attemptTimeout);
      return {
        value,
        attempts,
        latencyMs: Math.max(0, Math.round(performance.now() - started)),
        ...extractResponseUsage(value),
      };
    } catch (error) {
      const classification = classify(error);
      const canRetry = classification.retryable && attempts < OPENAI_MAX_ATTEMPTS &&
        performance.now() + retryDelayMs < deadlineAt;
      if (!canRetry) {
        throw new OpenAiCallError(
          classification.category,
          attempts,
          classification.retryable,
          classification.statusClass,
        );
      }
      if (retryDelayMs > 0) await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  throw new OpenAiCallError('unavailable', attempts, false, 'none');
}
