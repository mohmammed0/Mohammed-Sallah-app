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
});
Deno.serve(async (request) => {
  const correlationId = crypto.randomUUID();
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
    const { data, error } = await db.storage.from('request-media').download(input.storagePath);
    if (error || !data) throw new Error('PRIVATE_AUDIO_NOT_FOUND');
    const apiKey = Deno.env.get('OPENAI_API_KEY');
    if (!apiKey) {
      return json(request, { error: 'transcription_not_configured', manualFallback: true }, 503);
    }
    const client = new OpenAI({ apiKey });
    const file = new File([data], input.storagePath.split('/').at(-1) ?? 'recording.m4a', {
      type: data.type || 'audio/mp4',
    });
    const transcript = await client.audio.transcriptions.create({
      file,
      model: Deno.env.get('TRANSCRIPTION_MODEL') ?? 'gpt-4o-mini-transcribe',
      language: input.locale === 'ar' ? 'ar' : input.locale,
    });
    await db.from('transcription_jobs').insert({
      user_id: user.id,
      private_audio_path: input.storagePath,
      source_locale: input.locale,
      provider: 'openai',
      model: Deno.env.get('TRANSCRIPTION_MODEL') ?? 'gpt-4o-mini-transcribe',
      status: 'completed',
      transcript: transcript.text,
      completed_at: new Date().toISOString(),
    });
    return json(request, { transcript: transcript.text, editable: true });
  } catch (error) {
    return safeError(request, error, correlationId);
  }
});
