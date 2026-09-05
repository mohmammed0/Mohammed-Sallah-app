export type DiagnosticInputKind = 'text' | 'voice' | 'image';

export interface DiagnosticMediaUpload {
  purpose: string;
  finalPath: string | null;
}

export interface ConfirmedVoiceTranscript {
  userId: string;
  clientMessageId: string;
  privateAudioPath: string;
  status: string;
  requestId: string | null;
  customerEditedTranscript: string | null;
}

export interface ConfirmedVoiceTranscriptLookup {
  find(input: {
    userId: string;
    clientMessageId: string;
    privateAudioPath: string;
  }): Promise<ConfirmedVoiceTranscript | null>;
}

export async function assertConfirmedVoiceDiagnostic(
  input: {
    userId: string;
    clientMessageId: string | undefined;
    inputKind: DiagnosticInputKind;
    lastUserText: string;
    uploads: readonly DiagnosticMediaUpload[];
  },
  lookup: ConfirmedVoiceTranscriptLookup,
): Promise<void> {
  const audioUploads = input.uploads.filter((upload) => upload.purpose === 'request_audio');
  if (input.inputKind !== 'voice') {
    if (audioUploads.length > 0) throw new Error('DIAGNOSTIC_AUDIO_INPUT_MISMATCH');
    return;
  }
  const audio = audioUploads.length === 1 ? audioUploads[0] : undefined;
  if (!input.clientMessageId || !audio?.finalPath) {
    throw new Error('CONFIRMED_TRANSCRIPT_REQUIRED');
  }
  const confirmed = await lookup.find({
    userId: input.userId,
    clientMessageId: input.clientMessageId,
    privateAudioPath: audio.finalPath,
  });
  if (
    !confirmed || confirmed.userId !== input.userId ||
    confirmed.clientMessageId !== input.clientMessageId ||
    confirmed.privateAudioPath !== audio.finalPath || confirmed.status !== 'completed' ||
    confirmed.requestId !== null || typeof confirmed.customerEditedTranscript !== 'string' ||
    confirmed.customerEditedTranscript.length < 1 ||
    confirmed.customerEditedTranscript.length > 8_000 ||
    confirmed.customerEditedTranscript !== input.lastUserText
  ) {
    throw new Error('CONFIRMED_TRANSCRIPT_REQUIRED');
  }
}
