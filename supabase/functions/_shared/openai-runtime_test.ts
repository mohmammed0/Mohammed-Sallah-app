import {
  callOpenAi,
  extractResponseUsage,
  OpenAiCallError,
  type OpenAiRequestOptions,
  OpenAiResponseError,
} from './openai-runtime.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function providerError(status: number, name = 'APIError'): Error & { status: number } {
  return Object.assign(new Error('provider body must never escape'), { name, status });
}

Deno.test('OpenAI retry policy retries only timeout, 429, and 5xx within two total attempts', async () => {
  for (
    const error of [
      Object.assign(new Error('timeout body'), { name: 'APIConnectionTimeoutError' }),
      providerError(408, 'RequestTimeoutError'),
      providerError(429, 'RateLimitError'),
      providerError(503, 'InternalServerError'),
    ]
  ) {
    let calls = 0;
    const result = await callOpenAi(
      async (options) => {
        assert(options.maxRetries === 0, 'SDK retries must be disabled');
        assert(options.timeout > 0 && options.timeout <= 1_000, 'attempt timeout must be bounded');
        calls += 1;
        if (calls === 1) throw error;
        return 'ok';
      },
      { operation: 'diagnostic', deadlineMs: 1_000, retryDelayMs: 0 },
    );
    assert(result.value === 'ok', 'retry must return the provider result');
    assert(result.attempts === 2 && calls === 2, 'exactly one retry is allowed');
  }
});

Deno.test('OpenAI retry policy does not retry rejected requests or generic connection errors', async () => {
  for (
    const error of [
      providerError(400, 'BadRequestError'),
      providerError(401, 'AuthenticationError'),
      Object.assign(new Error('connection body'), { name: 'APIConnectionError' }),
    ]
  ) {
    let calls = 0;
    let observed: unknown;
    try {
      await callOpenAi(
        () => {
          calls += 1;
          throw error;
        },
        { operation: 'translation', deadlineMs: 1_000, retryDelayMs: 0 },
      );
    } catch (caught) {
      observed = caught;
    }
    assert(observed instanceof OpenAiCallError, 'provider errors must become safe typed errors');
    assert(calls === 1, 'terminal provider errors must not retry');
    assert(!observed.message.includes('body'), 'raw provider messages must be redacted');
    assert(!JSON.stringify(observed).includes('body'), 'serialized errors must be redacted');
  }
});

Deno.test('OpenAI quota and billing failures never consume a retry', async () => {
  for (
    const error of [
      Object.assign(providerError(429, 'RateLimitError'), { code: 'insufficient_quota' }),
      Object.assign(providerError(429, 'RateLimitError'), {
        error: { code: 'billing_hard_limit_reached' },
      }),
    ]
  ) {
    let calls = 0;
    let observed: unknown;
    try {
      await callOpenAi(
        () => {
          calls += 1;
          throw error;
        },
        { operation: 'diagnostic', deadlineMs: 1_000, retryDelayMs: 0 },
      );
    } catch (caught) {
      observed = caught;
    }
    assert(observed instanceof OpenAiCallError, 'quota failures must use the safe error type');
    assert(observed.category === 'quota_required', 'quota failure category changed');
    assert(observed.message === 'OPENAI_QUOTA_REQUIRED', 'quota failure code changed');
    assert(calls === 1, 'quota and billing failures must never retry');
  }
});

Deno.test('OpenAI runtime enforces an overall deadline and never exceeds two attempts', async () => {
  let calls = 0;
  const started = performance.now();
  let observed: unknown;
  try {
    await callOpenAi(
      async (options: OpenAiRequestOptions) => {
        calls += 1;
        await new Promise((resolve) => setTimeout(resolve, options.timeout + 25));
        return 'late';
      },
      { operation: 'transcription', deadlineMs: 80, retryDelayMs: 0 },
    );
  } catch (caught) {
    observed = caught;
  }
  const elapsed = performance.now() - started;
  assert(observed instanceof OpenAiCallError, 'deadline must fail with a safe typed error');
  assert(observed.category === 'timeout', 'deadline must be classified as timeout');
  assert(calls <= 2, 'provider must never receive more than two attempts');
  assert(elapsed < 250, 'overall deadline must remain bounded');
});

Deno.test('OpenAI usage extraction accepts only bounded nonnegative token counts', () => {
  const usage = extractResponseUsage({
    usage: { input_tokens: 123, output_tokens: 45, total_tokens: 168 },
  });
  assert(usage.inputUnits === 123 && usage.outputUnits === 45, 'token counts changed');
  const rejected = extractResponseUsage({
    usage: { input_tokens: -1, output_tokens: Number.MAX_SAFE_INTEGER + 1 },
  });
  assert(rejected.inputUnits === 0 && rejected.outputUnits === 0, 'unsafe counts must fail closed');
  const responseError = new OpenAiResponseError({
    attempts: 2,
    latencyMs: 10,
    inputUnits: 5,
    outputUnits: 1,
  });
  assert(responseError.message === 'OPENAI_INVALID_RESPONSE', 'response error code changed');
  assert(
    !JSON.stringify(responseError).includes('provider body'),
    'response errors must stay safe',
  );
});
