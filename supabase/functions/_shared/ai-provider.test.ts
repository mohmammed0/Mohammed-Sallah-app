import {
  assertProviderImages,
  buildOpenAiRequest,
  buildServerPrompt,
  createOpenAiProvider,
  type ProviderImage,
} from './ai-provider.ts';
import { deterministic, inputSchema } from './diagnostic.ts';

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
  const fallback = deterministic(input);
  const provider = createOpenAiProvider(
    {
      responses: {
        create(request) {
          observed = request;
          return Promise.resolve({ output_text: JSON.stringify(fallback) });
        },
      },
    },
    'vision-model',
    true,
  );
  await provider.diagnose(input, [image]);
  const serialized = JSON.stringify(observed);
  assert(serialized.includes('"type":"input_image"'), 'image input item must be present');
  assert(
    serialized.includes('data:image/png;base64,'),
    'image bytes must use an in-memory data URL',
  );
  assert(!serialized.includes('request-media/'), 'private storage path must not be supplied');
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
  assert(request.includes('diagnostic-v3'), 'request must declare the persisted prompt version');
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
