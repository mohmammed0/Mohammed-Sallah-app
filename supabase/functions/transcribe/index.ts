import OpenAI from 'npm:openai@7.5.0';
import { z } from 'npm:zod@4.4.3';
import { authenticatedUser, serviceClient } from '../_shared/auth.ts';
import { corsHeaders, json, safeError } from '../_shared/http.ts';
import { runClaimedTranscription } from '../_shared/transcription-claim.ts';
const schema = z.object({
  uploadId: z.uuid(),
  locale: z.enum(['ar', 'en', 'ur', 'hi']),
  clientMessageId: z.string().min(8).max(128),
});
Deno.serve(async (request) => {
  const correlationId = crypto.randomUUID();
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  try {
    const user = await authenticatedUser(request);
    const input = schema.parse(await request.json());
    const db = serviceClient();
    const uploadResult = await db.from('file_uploads').select(
      'id,user_id,purpose,status,target_bucket,final_path,detected_mime_type,size_bytes',
    ).eq('id', input.uploadId).eq('user_id', user.id).maybeSingle();
    const upload = z.object({
      id: z.uuid(),
      user_id: z.uuid(),
      purpose: z.literal('request_audio'),
      status: z.literal('clean'),
      target_bucket: z.string().min(1).max(100),
      final_path: z.string().min(1).max(500),
      detected_mime_type: z.literal('audio/mp4'),
      size_bytes: z.number().int().positive().max(20 * 1024 * 1024),
    }).safeParse(uploadResult.data);
    if (uploadResult.error || !upload.success) {
      return json(request, { error: 'clean_audio_required' }, 403);
    }
    const model = Deno.env.get('TRANSCRIPTION_MODEL') ?? 'gpt-4o-mini-transcribe';
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
        const apiKey = Deno.env.get('OPENAI_API_KEY');
        if (!apiKey) throw new Error('TRANSCRIPTION_NOT_CONFIGURED');
        const client = new OpenAI({ apiKey });
        const file = new File([data], 'recording.m4a', {
          type: data.type || 'audio/mp4',
        });
        const transcript = await client.audio.transcriptions.create({
          file,
          model,
          language: input.locale,
        });
        return transcript.text;
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
      },
      async fail(jobId, claimToken) {
        await db.from('transcription_jobs').update({
          status: 'failed',
          error_category: 'retryable_transcription_failure',
          claim_expires_at: null,
          claim_token: null,
        }).eq('id', jobId).eq('user_id', user.id).eq('status', 'processing')
          .eq('claim_token', claimToken);
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
      ...(result.cached ? { cached: true } : {}),
    });
  } catch (error) {
    return safeError(request, error, correlationId);
  }
});
