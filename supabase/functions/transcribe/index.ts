import OpenAI from 'npm:openai@7.5.0';
import { assertActorLegalConsent } from '../_shared/legal-consent.ts';
import { z } from 'npm:zod@4.4.3';
import { authenticatedUser, serviceClient } from '../_shared/auth.ts';
import { corsHeaders, json, safeError } from '../_shared/http.ts';
import { runClaimedTranscription } from '../_shared/transcription-claim.ts';
import { parseAppEnvironment } from '../_shared/scanner-control.ts';
import { createOpenAiTranscriptionProvider } from '../_shared/transcription-provider.ts';
import {
  DEFAULT_OPENAI_TRANSCRIPTION_MODEL,
  OPENAI_TRANSCRIPTION_DEADLINE_MS,
  OpenAiCallError,
  OpenAiResponseError,
} from '../_shared/openai-runtime.ts';
const MAX_ACCEPTED_AUDIO_BYTES = 20 * 1024 * 1024;
const MAX_TRANSCRIPT_CHARACTERS = 8_000;
const baseSchema = z.object({
  uploadId: z.uuid(),
  locale: z.enum(['ar', 'en', 'ur', 'hi']),
  clientMessageId: z.string().min(8).max(128),
});
const schema = z.union([
  baseSchema.extend({
    action: z.literal('confirm'),
    transcript: z.string().max(MAX_TRANSCRIPT_CHARACTERS),
  }),
  baseSchema.extend({ action: z.literal('transcribe').optional() }),
]);

interface TranscriptConfirmationInput {
  userId: string;
  clientMessageId: string;
  privateAudioPath: string;
  transcript: string;
}

interface TranscriptConfirmationStore {
  persist(input: TranscriptConfirmationInput): Promise<boolean>;
}

export async function confirmReviewedTranscript(
  input: TranscriptConfirmationInput,
  store: TranscriptConfirmationStore,
): Promise<{ transcript: string; editable: true; confirmed: true }> {
  const parsed = z.string().trim().min(1).max(MAX_TRANSCRIPT_CHARACTERS).safeParse(
    input.transcript,
  );
  if (!parsed.success) throw new Error('TRANSCRIPT_CONFIRMATION_INVALID');
  const confirmed = { ...input, transcript: parsed.data };
  if (!(await store.persist(confirmed))) {
    throw new Error('TRANSCRIPT_CONFIRMATION_NOT_AUTHORIZED');
  }
  return { transcript: parsed.data, editable: true, confirmed: true };
}

interface TranscriptionRateLimitInput {
  keyHash: string;
  operation: 'transcription';
  windowStart: string;
  limit: 12;
}

interface TranscriptionRateLimitStore {
  consume(input: TranscriptionRateLimitInput): Promise<boolean>;
}

export async function consumeTranscriptionProviderBudget(
  userId: string,
  store: TranscriptionRateLimitStore,
  now = new Date(),
): Promise<void> {
  const windowStart = new Date(now);
  windowStart.setUTCMinutes(0, 0, 0);
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(userId));
  const keyHash = Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, '0'))
    .join('');
  const allowed = await store.consume({
    keyHash,
    operation: 'transcription',
    windowStart: windowStart.toISOString(),
    limit: 12,
  });
  if (!allowed) throw new Error('RATE_LIMIT');
}

function providerFailure(error: unknown): {
  category: string;
  attempts: number;
  inputUnits: number;
  outputUnits: number;
} {
  if (error instanceof OpenAiCallError) {
    return { category: error.category, attempts: error.attempts, inputUnits: 0, outputUnits: 0 };
  }
  if (error instanceof OpenAiResponseError) {
    return {
      category: error.category,
      attempts: error.attempts,
      inputUnits: error.inputUnits,
      outputUnits: error.outputUnits,
    };
  }
  return {
    category: error instanceof Error && error.message === 'TRANSCRIPTION_NOT_CONFIGURED'
      ? 'provider_not_configured'
      : error instanceof Error && error.message === 'RATE_LIMIT'
      ? 'rate_limit'
      : 'provider_unavailable',
    attempts: 0,
    inputUnits: 0,
    outputUnits: 0,
  };
}

export async function handleTranscribe(request: Request): Promise<Response> {
  const correlationId = crypto.randomUUID();
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== 'POST') return json(request, { error: 'method_not_allowed' }, 405);
  const started = Date.now();
  try {
    parseAppEnvironment(Deno.env.get('APP_ENV'));
    const user = await authenticatedUser(request);
    const input = schema.parse(await request.json());
    const db = serviceClient();
    await assertActorLegalConsent(() =>
      db.rpc('assert_actor_legal_consent', { p_user_id: user.id })
    );
    const uploadResult = await db.from('file_uploads').select(
      'id,user_id,purpose,status,target_bucket,final_path,declared_mime_type,detected_mime_type,size_bytes,sanitized',
    ).eq('id', input.uploadId).eq('user_id', user.id).maybeSingle();
    const upload = z.object({
      id: z.uuid(),
      user_id: z.uuid(),
      purpose: z.literal('request_audio'),
      status: z.literal('clean'),
      target_bucket: z.literal('request-media'),
      final_path: z.string().min(1).max(500),
      declared_mime_type: z.literal('audio/mp4'),
      detected_mime_type: z.literal('audio/mp4'),
      size_bytes: z.number().int().positive().max(MAX_ACCEPTED_AUDIO_BYTES),
      sanitized: z.literal(true),
    }).safeParse(uploadResult.data);
    if (uploadResult.error || !upload.success) {
      return json(request, { error: 'clean_audio_required' }, 403);
    }
    if (input.action === 'confirm') {
      const confirmed = await confirmReviewedTranscript(
        {
          userId: user.id,
          clientMessageId: input.clientMessageId,
          privateAudioPath: upload.data.final_path,
          transcript: input.transcript,
        },
        {
          async persist(reviewed) {
            const { data, error } = await db.from('transcription_jobs').update({
              customer_edited_transcript: reviewed.transcript,
            }).eq('user_id', reviewed.userId)
              .eq('client_message_id', reviewed.clientMessageId)
              .eq('private_audio_path', reviewed.privateAudioPath)
              .eq('status', 'completed')
              .is('request_id', null)
              .select('id')
              .maybeSingle();
            return !error && Boolean(data);
          },
        },
      );
      return json(request, confirmed);
    }
    const providerName = Deno.env.get('TRANSCRIPTION_PROVIDER');
    if (!providerName) throw new Error('TRANSCRIPTION_NOT_CONFIGURED');
    if (providerName !== 'openai') throw new Error('TRANSCRIPTION_PROVIDER_UNSUPPORTED');
    const model = Deno.env.get('OPENAI_TRANSCRIPTION_MODEL') ??
      DEFAULT_OPENAI_TRANSCRIPTION_MODEL;
    let providerTelemetry = {
      attempts: 0,
      latencyMs: 0,
      inputUnits: 0,
      outputUnits: 0,
    };
    let providerErrorCategory = 'provider_unavailable';
    const result = await runClaimedTranscription({
      async claim() {
        const { data, error } = await db.rpc('claim_transcription_job', {
          p_user_id: user.id,
          p_client_message_id: input.clientMessageId,
          p_private_audio_path: upload.data.final_path,
          p_source_locale: input.locale,
          p_provider: 'openai',
          p_model: model,
        });
        if (error) throw new Error(`TRANSCRIPTION_CLAIM_${error.code}`);
        return z.discriminatedUnion('state', [
          z.object({ state: z.literal('claimed'), jobId: z.uuid(), claimToken: z.uuid() }),
          z.object({
            state: z.literal('completed'),
            jobId: z.uuid(),
            transcript: z.string().min(1),
          }),
          z.object({ state: z.literal('in_progress'), jobId: z.uuid() }),
          z.object({ state: z.literal('media_conflict'), jobId: z.uuid() }),
        ]).parse(data);
      },
      async transcribe(_jobId, _claimToken) {
        const { data, error } = await db.storage.from(upload.data.target_bucket).download(
          upload.data.final_path,
        );
        if (error || !data) throw new Error('PRIVATE_AUDIO_NOT_FOUND');
        if (data.size !== upload.data.size_bytes || data.type !== 'audio/mp4') {
          throw new Error('PRIVATE_AUDIO_REVALIDATION_FAILED');
        }
        const apiKey = Deno.env.get('OPENAI_API_KEY');
        if (!apiKey) throw new Error('TRANSCRIPTION_NOT_CONFIGURED');
        const client = new OpenAI({
          apiKey,
          timeout: OPENAI_TRANSCRIPTION_DEADLINE_MS,
          maxRetries: 0,
          logLevel: 'off',
        });
        const file = new File([data], 'recording.m4a', {
          type: 'audio/mp4',
        });
        try {
          const provider = createOpenAiTranscriptionProvider(
            client as unknown as Parameters<typeof createOpenAiTranscriptionProvider>[0],
            model,
          );
          await consumeTranscriptionProviderBudget(user.id, {
            async consume(budget) {
              const { data, error } = await db.rpc('consume_rate_limit', {
                p_key_hash: budget.keyHash,
                p_operation: budget.operation,
                p_window_start: budget.windowStart,
                p_limit: budget.limit,
              });
              return !error && data === true;
            },
          });
          const live = await provider.transcribe(file, input.locale);
          providerTelemetry = {
            attempts: live.attempts,
            latencyMs: live.latencyMs,
            inputUnits: live.inputUnits,
            outputUnits: live.outputUnits,
          };
          return live.transcript;
        } catch (error) {
          const failure = providerFailure(error);
          providerTelemetry = {
            attempts: failure.attempts,
            latencyMs: Date.now() - started,
            inputUnits: failure.inputUnits,
            outputUnits: failure.outputUnits,
          };
          providerErrorCategory = failure.category;
          console.error(JSON.stringify({
            event: 'openai_operation_failure',
            operation: 'transcription',
            category: failure.category,
            attempts: failure.attempts,
            latencyMs: Date.now() - started,
            correlationId,
          }));
          throw error;
        }
      },
      async complete(jobId, claimToken, transcript) {
        const { data, error } = await db.from('transcription_jobs').update({
          status: 'completed',
          transcript,
          completed_at: new Date().toISOString(),
          error_category: null,
          claim_expires_at: null,
          claim_token: null,
        }).eq('id', jobId).eq('user_id', user.id).eq('status', 'processing')
          .eq('claim_token', claimToken).select('id').maybeSingle();
        if (error || !data) {
          throw new Error(`TRANSCRIPTION_COMPLETE_${error?.code ?? 'CLAIM_LOST'}`);
        }
        const { error: usageError } = await db.from('ai_usage_events').insert({
          user_id: user.id,
          provider: providerName,
          model,
          operation: 'transcription',
          input_units: providerTelemetry.inputUnits,
          output_units: providerTelemetry.outputUnits,
          success: true,
          error_category: null,
          latency_ms: Date.now() - started,
        });
        if (usageError) {
          console.error(JSON.stringify({
            event: 'openai_usage_persist_failure',
            operation: 'transcription',
            correlationId,
          }));
        }
      },
      async fail(jobId, claimToken) {
        const { error: failureUpdateError } = await db.from('transcription_jobs').update({
          status: 'failed',
          error_category: providerErrorCategory,
          claim_expires_at: null,
          claim_token: null,
        }).eq('id', jobId).eq('user_id', user.id).eq('status', 'processing')
          .eq('claim_token', claimToken);
        const { error: failureUsageError } = await db.from('ai_usage_events').insert({
          user_id: user.id,
          provider: providerName,
          model,
          operation: 'transcription',
          input_units: providerTelemetry.inputUnits,
          output_units: providerTelemetry.outputUnits,
          success: false,
          error_category: providerErrorCategory,
          latency_ms: Date.now() - started,
        });
        if (failureUpdateError || failureUsageError) {
          console.error(JSON.stringify({
            event: 'openai_failure_persist_failure',
            operation: 'transcription',
            correlationId,
          }));
        }
      },
    });
    if (result.state === 'media_conflict') {
      return json(request, { error: 'client_message_media_conflict' }, 409);
    }
    if (result.state === 'in_progress') {
      return json(request, { error: 'transcription_in_progress', retryable: true }, 409);
    }
    return json(request, {
      transcript: result.transcript,
      editable: true,
      metadata: {
        provider: providerName,
        model,
        attempts: result.cached ? 0 : providerTelemetry.attempts,
        latencyMs: result.cached ? 0 : providerTelemetry.latencyMs,
        inputUnits: result.cached ? 0 : providerTelemetry.inputUnits,
        outputUnits: result.cached ? 0 : providerTelemetry.outputUnits,
      },
      ...(result.cached ? { cached: true } : {}),
    });
  } catch (error) {
    return safeError(request, error, correlationId);
  }
}

if (import.meta.main) Deno.serve(handleTranscribe);
