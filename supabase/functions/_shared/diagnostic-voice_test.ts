import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { assertConfirmedVoiceDiagnostic } from './diagnostic-voice.ts';

const userId = '11111111-1111-4111-8111-111111111111';
const clientMessageId = 'voice-client-message-0001';
const audioPath = 'opaque/clean/audio.m4a';
const audio = [{ purpose: 'request_audio', finalPath: audioPath }] as const;
const confirmed = {
  userId,
  clientMessageId,
  privateAudioPath: audioPath,
  status: 'completed',
  requestId: null,
  customerEditedTranscript: 'The kitchen tap is leaking slowly.',
} as const;

Deno.test('voice diagnostic accepts only the exact server-confirmed customer transcript', async () => {
  const lookups: unknown[] = [];
  await assertConfirmedVoiceDiagnostic(
    {
      userId,
      clientMessageId,
      inputKind: 'voice',
      lastUserText: confirmed.customerEditedTranscript,
      uploads: audio,
    },
    {
      find(input) {
        lookups.push(input);
        return Promise.resolve(confirmed);
      },
    },
  );
  assertEquals(lookups, [{ userId, clientMessageId, privateAudioPath: audioPath }]);
});

Deno.test('voice diagnostic rejects missing, stale, cross-boundary, or altered confirmation', async () => {
  const base = {
    userId,
    clientMessageId,
    inputKind: 'voice' as const,
    lastUserText: confirmed.customerEditedTranscript,
    uploads: audio,
  };
  for (
    const row of [
      null,
      { ...confirmed, userId: '22222222-2222-4222-8222-222222222222' },
      { ...confirmed, clientMessageId: 'different-client-message' },
      { ...confirmed, privateAudioPath: 'different/clean/audio.m4a' },
      { ...confirmed, status: 'failed' },
      { ...confirmed, requestId: '33333333-3333-4333-8333-333333333333' },
      { ...confirmed, customerEditedTranscript: 'A different confirmed transcript.' },
    ]
  ) {
    await assertRejects(
      () =>
        assertConfirmedVoiceDiagnostic(base, {
          find: () => Promise.resolve(row),
        }),
      Error,
      'CONFIRMED_TRANSCRIPT_REQUIRED',
    );
  }
});

Deno.test('diagnostic media shape rejects voice without audio and nonvoice audio bypasses', async () => {
  const lookup = { find: () => Promise.resolve(confirmed) };
  await assertRejects(
    () =>
      assertConfirmedVoiceDiagnostic(
        {
          userId,
          clientMessageId,
          inputKind: 'voice',
          lastUserText: confirmed.customerEditedTranscript,
          uploads: [],
        },
        lookup,
      ),
    Error,
    'CONFIRMED_TRANSCRIPT_REQUIRED',
  );
  for (const inputKind of ['text', 'image'] as const) {
    await assertRejects(
      () =>
        assertConfirmedVoiceDiagnostic(
          {
            userId,
            clientMessageId,
            inputKind,
            lastUserText: confirmed.customerEditedTranscript,
            uploads: audio,
          },
          lookup,
        ),
      Error,
      'DIAGNOSTIC_AUDIO_INPUT_MISMATCH',
    );
  }
  await assertRejects(
    () =>
      assertConfirmedVoiceDiagnostic(
        {
          userId,
          clientMessageId: undefined,
          inputKind: 'voice',
          lastUserText: confirmed.customerEditedTranscript,
          uploads: audio,
        },
        lookup,
      ),
    Error,
    'CONFIRMED_TRANSCRIPT_REQUIRED',
  );
  await assertRejects(
    () =>
      assertConfirmedVoiceDiagnostic(
        {
          userId,
          clientMessageId,
          inputKind: 'voice',
          lastUserText: confirmed.customerEditedTranscript,
          uploads: [...audio, ...audio],
        },
        lookup,
      ),
    Error,
    'CONFIRMED_TRANSCRIPT_REQUIRED',
  );
});
