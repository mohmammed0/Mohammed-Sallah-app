import {
  assertProviderImages,
  buildOpenAiRequest,
  buildServerPrompt,
  createOpenAiProvider,
  type ProviderImage,
} from './ai-provider.ts';
import { deterministic, inputSchema } from './diagnostic.ts';
import {
  OPENAI_DIAGNOSTIC_MAX_OUTPUT_TOKENS,
  type OpenAiRequestOptions,
  OpenAiResponseError,
} from './openai-runtime.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const input = inputSchema.parse({
  locale: 'en',
  messages: [{ role: 'user', text: 'The kitchen pipe is leaking tomorrow in Riyadh.' }],
  categoryHints: ['plumbing'],
  confirmedCategorySlug: 'plumbing',
  summaryRequested: true,
  inputKind: 'image',
  mediaUploadIds: ['11111111-1111-4111-8111-111111111111'],
});
const image: ProviderImage = {
  uploadId: input.mediaUploadIds[0]!,
  mimeType: 'image/png',
  bytes: new Uint8Array([0x89, 0x50, 0x4e, 0x47]),
};

Deno.test('vision provider contract supplies image bytes without private storage URLs', async () => {
  let observed: Record<string, unknown> | undefined;
  let observedOptions: OpenAiRequestOptions | undefined;
  const fallback = deterministic(input);
  const provider = createOpenAiProvider(
    {
      responses: {
        create(request, options) {
          observed = request;
          observedOptions = options;
          return Promise.resolve({
            output_text: JSON.stringify({ ...fallback, metadata: undefined }),
            usage: { input_tokens: 123, output_tokens: 45 },
          });
        },
      },
    },
    'vision-model',
    true,
  );
  const result = await provider.diagnose(input, [image]);
  const serialized = JSON.stringify(observed);
  assert(serialized.includes('"type":"input_image"'), 'image input item must be present');
  assert(
    serialized.includes('data:image/png;base64,'),
    'image bytes must use an in-memory data URL',
  );
  assert(!serialized.includes('request-media/'), 'private storage path must not be supplied');
  assert(observed?.max_output_tokens === OPENAI_DIAGNOSTIC_MAX_OUTPUT_TOKENS, 'output cap missing');
  assert(observed?.store === false, 'provider storage must remain disabled');
  assert(!serialized.includes('"metadata"'), 'server-owned metadata must not be model-authored');
  assert(observedOptions?.maxRetries === 0, 'SDK retries must be disabled');
  assert(result.inputUnits === 123 && result.outputUnits === 45, 'usage must be captured safely');
  assert(result.attempts === 1, 'successful request must report one attempt');
  assert(result.diagnostic.metadata.providerAttempts === 1, 'diagnostic attempts missing');
});

Deno.test('model without vision support fails before any provider request', async () => {
  let called = false;
  const provider = createOpenAiProvider(
    {
      responses: {
        create() {
          called = true;
          return Promise.reject(new Error('unexpected'));
        },
      },
    },
    'text-model',
    false,
  );
  let rejected = false;
  try {
    await provider.diagnose(input, [image]);
  } catch (error) {
    rejected = error instanceof Error && error.message === 'MODEL_VISION_NOT_SUPPORTED';
  }
  assert(rejected, 'non-vision model must be rejected deterministically');
  assert(!called, 'provider request must not be sent');
});

Deno.test('prompt carries category confirmation and explicit summary request', () => {
  const prompt = buildServerPrompt(input);
  assert(prompt.includes('Confirmed category slug: plumbing'), 'category control must be explicit');
  assert(prompt.includes('Explicit summary requested: true'), 'summary control must be explicit');
  const request = JSON.stringify(buildOpenAiRequest('vision-model', input, []));
  assert(request.includes('diagnostic-v4'), 'request must declare the persisted prompt version');
  assert(request.includes('quickReplies'), 'request must require contextual quick replies');
});

Deno.test('provider image limits are strict', () => {
  assertProviderImages([image]);
  let rejected = false;
  try {
    assertProviderImages(
      Array.from({ length: 5 }, (_, index) => ({ ...image, uploadId: String(index) })),
    );
  } catch {
    rejected = true;
  }
  assert(rejected, 'more than four images must be rejected');
});

Deno.test('malformed provider output fails safely without deterministic fallback', async () => {
  const provider = createOpenAiProvider(
    {
      responses: {
        create() {
          return Promise.resolve({
            output_text: '{not-json',
            usage: { input_tokens: 8, output_tokens: 2 },
          });
        },
      },
    },
    'gpt-5.6-terra',
    true,
  );
  let observed: unknown;
  try {
    await provider.diagnose(input, []);
  } catch (error) {
    observed = error;
  }
  assert(observed instanceof OpenAiResponseError, 'invalid output must use the safe error type');
  assert(observed.attempts === 1, 'invalid output must not be retried');
  assert(observed.inputUnits === 8 && observed.outputUnits === 2, 'safe usage must be retained');
  assert(!observed.message.includes('not-json'), 'provider output must not escape in errors');
});

Deno.test('provider-authored metadata and unknown fields are rejected without retry', async () => {
  const providerOutput = deterministic(input);
  for (
    const extra of [
      { metadata: providerOutput.metadata },
      { unexpectedProviderField: 'must-not-survive' },
    ]
  ) {
    let calls = 0;
    const provider = createOpenAiProvider(
      {
        responses: {
          create() {
            calls += 1;
            const { metadata: _metadata, ...providerFields } = providerOutput;
            return Promise.resolve({
              output_text: JSON.stringify({ ...providerFields, ...extra }),
            });
          },
        },
      },
      'gpt-5.6-terra',
      true,
    );
    let observed: unknown;
    try {
      await provider.diagnose(input, []);
    } catch (error) {
      observed = error;
    }
    assert(observed instanceof OpenAiResponseError, 'untrusted fields must fail safely');
    assert(calls === 1, 'invalid provider fields must not retry');
  }
});

Deno.test('fabricated catalog identifiers are rejected without repair', async () => {
  for (
    const fabricated of [
      { suggestedCategorySlug: 'invented-category' },
      { suggestedSubcategorySlug: 'invented-subcategory' },
    ]
  ) {
    let calls = 0;
    const providerOutput = deterministic(input);
    const { metadata: _metadata, ...providerFields } = providerOutput;
    const provider = createOpenAiProvider(
      {
        responses: {
          create() {
            calls += 1;
            return Promise.resolve({
              output_text: JSON.stringify({ ...providerFields, ...fabricated }),
            });
          },
        },
      },
      'gpt-5.6-terra',
      true,
    );
    let observed: unknown;
    try {
      await provider.diagnose(input, []);
    } catch (error) {
      observed = error;
    }
    assert(observed instanceof OpenAiResponseError, 'fabricated identifiers must fail safely');
    assert(calls === 1, 'fabricated identifiers must not retry');
  }
});
