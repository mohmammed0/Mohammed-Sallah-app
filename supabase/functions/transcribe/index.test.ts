import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { confirmReviewedTranscript, consumeTranscriptionProviderBudget } from './index.ts';

const userId = '11111111-1111-4111-8111-111111111111';
const clientMessageId = 'voice-client-message-0001';
const privateAudioPath = 'opaque/clean/audio.m4a';

Deno.test('confirmed transcript persists the bounded customer edit without a provider call', async () => {
  const writes: unknown[] = [];
  const result = await confirmReviewedTranscript(
    {
      userId,
      clientMessageId,
      privateAudioPath,
      transcript: '  The kitchen tap is leaking slowly.  ',
    },
    {
      persist(input) {
        writes.push(input);
        return Promise.resolve(true);
      },
    },
  );
  assertEquals(result, {
    transcript: 'The kitchen tap is leaking slowly.',
    editable: true,
    confirmed: true,
  });
  assertEquals(writes, [{
    userId,
    clientMessageId,
    privateAudioPath,
    transcript: 'The kitchen tap is leaking slowly.',
  }]);
});

Deno.test('transcript confirmation rejects blank, oversized, or unauthorized persistence safely', async () => {
  const store = { persist: () => Promise.resolve(true) };
  await assertRejects(
    () =>
      confirmReviewedTranscript(
        { userId, clientMessageId, privateAudioPath, transcript: '   ' },
        store,
      ),
    Error,
    'TRANSCRIPT_CONFIRMATION_INVALID',
  );
  await assertRejects(
    () =>
      confirmReviewedTranscript(
        { userId, clientMessageId, privateAudioPath, transcript: 'x'.repeat(8_001) },
        store,
      ),
    Error,
    'TRANSCRIPT_CONFIRMATION_INVALID',
  );
  await assertRejects(
    () =>
      confirmReviewedTranscript(
        { userId, clientMessageId, privateAudioPath, transcript: 'Safe transcript' },
        { persist: () => Promise.resolve(false) },
      ),
    Error,
    'TRANSCRIPT_CONFIRMATION_NOT_AUTHORIZED',
  );
});

Deno.test('provider budget is user-scoped, hourly, and limited to twelve claimed operations', async () => {
  const observed: unknown[] = [];
  await consumeTranscriptionProviderBudget(
    userId,
    {
      consume(input) {
        observed.push(input);
        return Promise.resolve(true);
      },
    },
    new Date('2026-08-25T19:27:42.000Z'),
  );
  assertEquals(observed, [{
    keyHash: 'bd7662a5eeb41614e720d477abfcb2272e19a8a70a93b7e3bc8560d44ad326e9',
    operation: 'transcription',
    windowStart: '2026-08-25T19:00:00.000Z',
    limit: 12,
  }]);

  await assertRejects(
    () =>
      consumeTranscriptionProviderBudget(userId, {
        consume: () => Promise.resolve(false),
      }),
    Error,
    'RATE_LIMIT',
  );
});
