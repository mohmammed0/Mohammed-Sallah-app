import OpenAI from 'npm:openai@7.5.0';
import { z } from 'npm:zod@4.4.3';
import { authenticatedUser, serviceClient } from '../_shared/auth.ts';
import { corsHeaders, json, safeError } from '../_shared/http.ts';
const schema = z.object({
  storagePath: z
    .string()
    .regex(/^[0-9a-f-]{36}\//)
    .max(500),
  locale: z.enum(['ar', 'en', 'ur', 'hi']),
  clientMessageId: z.string().min(8).max(128),
});
Deno.serve(async (request) => {
  const correlationId = crypto.randomUUID();
  let failedJob: { id: string; userId: string } | null = null;
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  try {
    const user = await authenticatedUser(request);
    const input = schema.parse(await request.json());
    if (!input.storagePath.startsWith(`${user.id}/`)) {
      return json(request, { error: 'access_denied' }, 403);
    }
    const db = serviceClient();
    const { data: existing, error: existingError } = await db
      .from('transcription_jobs')
      .select('id,status,transcript,private_audio_path')
      .eq('user_id', user.id)
      .eq('client_message_id', input.clientMessageId)
      .maybeSingle();
    if (existingError) throw new Error(`TRANSCRIPTION_LOOKUP_${existingError.code}`);
    if (
      existing?.private_audio_path !== undefined &&
      existing.private_audio_path !== input.storagePath
    ) {
      return json(request, { error: 'client_message_media_conflict' }, 409);
    }
    if (existing?.status === 'completed' && existing.transcript) {
      return json(request, { transcript: existing.transcript, editable: true, cached: true });
    }
    if (existing?.status === 'processing') {
      return json(request, { error: 'transcription_in_progress', retryable: true }, 409);
    }
    const model = Deno.env.get('TRANSCRIPTION_MODEL') ?? 'gpt-4o-mini-transcribe';
    const { data: job, error: jobError } = await db.from('transcription_jobs').upsert({
      user_id: user.id,
      client_message_id: input.clientMessageId,
      private_audio_path: input.storagePath,
      source_locale: input.locale,
      provider: 'openai',
      model,
      status: 'processing',
      transcript: null,
      completed_at: null,
    }, { onConflict: 'user_id,client_message_id' }).select('id').single();
    if (jobError || !job) throw new Error(`TRANSCRIPTION_JOB_${jobError?.code ?? 'FAILED'}`);
    failedJob = { id: job.id, userId: user.id };
    const { data, error } = await db.storage.from('request-media').download(input.storagePath);
    if (error || !data) throw new Error('PRIVATE_AUDIO_NOT_FOUND');
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      throw new Error('TRANSCRIPTION_NOT_CONFIGURED');
    }
    const client = new OpenAI({ apiKey });
    const file = new File([data], input.storagePath.split('/').at(-1) ?? 'recording.m4a', {
      type: data.type || 'audio/mp4',
    });
    const transcript = await client.audio.transcriptions.create({
      file,
      model,
      language: input.locale === 'ar' ? 'ar' : input.locale,
    });
    const { error: completionError } = await db.from('transcription_jobs').update({
      status: 'completed',
      transcript: transcript.text,
      completed_at: new Date().toISOString(),
    }).eq('id', job.id).eq('user_id', user.id);
    if (completionError) throw new Error(`TRANSCRIPTION_COMPLETE_${completionError.code}`);
    return json(request, { transcript: transcript.text, editable: true });
  } catch (error) {
    if (failedJob) {
      await serviceClient().from('transcription_jobs').update({
        status: 'failed',
        error_category: 'retryable_transcription_failure',
      }).eq('id', failedJob.id).eq('user_id', failedJob.userId);
    }
    return safeError(request, error, correlationId);
  }
});
