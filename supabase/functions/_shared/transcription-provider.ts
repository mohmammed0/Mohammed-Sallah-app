import { z } from 'npm:zod@4.4.3';
import {
  callOpenAi,
  OPENAI_TRANSCRIPTION_DEADLINE_MS,
  type OpenAiRequestOptions,
  OpenAiResponseError,
} from './openai-runtime.ts';

export const MAX_TRANSCRIPTION_AUDIO_BYTES = 20 * 1024 * 1024;
export const MAX_TRANSCRIPT_CHARACTERS = 8_000;
export const TRANSCRIPTION_CONTEXT_HINT =
  'Sallah maintenance service vocabulary: plumbing, electrical, air conditioning, leak, breaker, compressor, Riyadh, Jeddah, Dammam. The speaker may code-switch between Arabic, English, Urdu, and Hindi.';
export const TRANSCRIPTION_KEYWORDS = [
  'Sallah',
  'plumbing',
  'electrical',
  'air conditioning',
  'Riyadh',
  'Jeddah',
  'Dammam',
] as const;

export type TranscriptionLocale = 'ar' | 'en' | 'ur' | 'hi';

export interface TranscriptionClient {
  audio: {
    transcriptions: {
      create(
        request: Record<string, unknown>,
        options: OpenAiRequestOptions & { body?: Record<string, unknown> },
      ): Promise<{
        text: string;
        usage?: { input_tokens?: number; output_tokens?: number } | null;
      }>;
    };
  };
}

const transcriptSchema = z.string().trim().min(1).max(MAX_TRANSCRIPT_CHARACTERS);

export function createOpenAiTranscriptionProvider(client: TranscriptionClient, model: string) {
  return {
    name: 'openai' as const,
    model,
    async transcribe(file: File, locale: TranscriptionLocale): Promise<{
      transcript: string;
      attempts: number;
      latencyMs: number;
      inputUnits: number;
      outputUnits: number;
    }> {
      if (
        file.size < 1 || file.size > MAX_TRANSCRIPTION_AUDIO_BYTES || file.type !== 'audio/mp4'
      ) {
        throw new Error('TRANSCRIPTION_AUDIO_INVALID');
      }
      const call = await callOpenAi(
        (options) => {
          const request = {
            file,
            model,
            prompt: TRANSCRIPTION_CONTEXT_HINT,
            response_format: 'json',
          };
          const languages = [
            locale,
            ...(['ar', 'en', 'ur', 'hi'] as const).filter((item) => item !== locale),
          ];
          return client.audio.transcriptions.create(request, {
            ...options,
            body: { ...request, keywords: TRANSCRIPTION_KEYWORDS, languages },
          });
        },
        { operation: 'transcription', deadlineMs: OPENAI_TRANSCRIPTION_DEADLINE_MS },
      );
      try {
        const transcript = transcriptSchema.parse(call.value.text);
        const { value: _response, ...telemetry } = call;
        return { transcript, ...telemetry };
      } catch {
        throw new OpenAiResponseError(call);
      }
    },
  };
}
