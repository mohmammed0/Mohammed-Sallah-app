import {
  createOpenAiTranscriptionProvider,
  MAX_TRANSCRIPTION_AUDIO_BYTES,
  TRANSCRIPTION_CONTEXT_HINT,
  TRANSCRIPTION_KEYWORDS,
} from './transcription-provider.ts';
import { type OpenAiRequestOptions, OpenAiResponseError } from './openai-runtime.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const file = new File([new Uint8Array([0, 1, 2, 3])], 'recording.m4a', {
  type: 'audio/mp4',
});

Deno.test('OpenAI transcription uses the fixed model boundary and returns editable bounded text', async () => {
  let request: Record<string, unknown> | undefined;
  let requestOptions: (OpenAiRequestOptions & { body?: Record<string, unknown> }) | undefined;
  const provider = createOpenAiTranscriptionProvider(
    {
      audio: {
        transcriptions: {
          create(input, options) {
            request = input;
            requestOptions = options;
            return Promise.resolve({ text: '  The pipe is leaking in Riyadh.  ' });
          },
        },
      },
    },
    'gpt-transcribe',
  );
  const result = await provider.transcribe(file, 'en');
  assert(result.transcript === 'The pipe is leaking in Riyadh.', 'transcript must be trimmed');
  assert(request?.model === 'gpt-transcribe', 'configured transcription model changed');
  assert(!('language' in (request ?? {})), 'singular language is invalid for gpt-transcribe');
  assert(request?.prompt === TRANSCRIPTION_CONTEXT_HINT, 'bounded maintenance context missing');
  assert(request?.response_format === 'json', 'structured transcription response missing');
  assert(requestOptions?.maxRetries === 0, 'SDK retries must be disabled');
  const providerBody = requestOptions?.body as Record<string, unknown> | undefined;
  assert(
    JSON.stringify(providerBody?.languages) === JSON.stringify(['en', 'ar', 'ur', 'hi']),
    'ordered multilingual hints missing',
  );
  assert(
    JSON.stringify(providerBody?.keywords) === JSON.stringify(TRANSCRIPTION_KEYWORDS),
    'bounded keyword hints missing',
  );
  assert(MAX_TRANSCRIPTION_AUDIO_BYTES === 20 * 1024 * 1024, '20MiB media contract changed');
  assert(result.attempts === 1, 'successful transcription must use one attempt');
});

Deno.test('transcription accepts all supported locales and retries a 5xx only once', async () => {
  for (const locale of ['ar', 'en', 'ur', 'hi'] as const) {
    let calls = 0;
    const provider = createOpenAiTranscriptionProvider(
      {
        audio: {
          transcriptions: {
            create() {
              calls += 1;
              if (calls === 1) {
                throw Object.assign(new Error('raw provider body'), {
                  name: 'InternalServerError',
                  status: 500,
                });
              }
              return Promise.resolve({ text: `safe-${locale}` });
            },
          },
        },
      },
      'gpt-transcribe',
    );
    const result = await provider.transcribe(file, locale);
    assert(result.transcript === `safe-${locale}`, `${locale} transcript changed`);
    assert(result.attempts === 2 && calls === 2, 'transcription retry count changed');
  }
});

Deno.test('transcription rejects unsafe media and invalid output without a repair retry', async () => {
  let calls = 0;
  const provider = createOpenAiTranscriptionProvider(
    {
      audio: {
        transcriptions: {
          create() {
            calls += 1;
            return Promise.resolve({ text: ' '.repeat(2) });
          },
        },
      },
    },
    'gpt-transcribe',
  );
  let invalidOutput: unknown;
  try {
    await provider.transcribe(file, 'ar');
  } catch (error) {
    invalidOutput = error;
  }
  assert(invalidOutput instanceof OpenAiResponseError, 'empty output must fail safely');
  assert(calls === 1, 'invalid output must not retry');

  for (
    const unsafeFile of [
      new File([], 'empty.m4a', { type: 'audio/mp4' }),
      new File([new Uint8Array([1])], 'wrong.wav', { type: 'audio/wav' }),
      { size: MAX_TRANSCRIPTION_AUDIO_BYTES + 1, type: 'audio/mp4' } as File,
    ]
  ) {
    let rejected = false;
    try {
      await provider.transcribe(unsafeFile, 'ar');
    } catch (error) {
      rejected = error instanceof Error && error.message === 'TRANSCRIPTION_AUDIO_INVALID';
    }
    assert(rejected, 'unsafe audio must be rejected before OpenAI');
  }
  assert(calls === 1, 'unsafe media must not call OpenAI');
});
