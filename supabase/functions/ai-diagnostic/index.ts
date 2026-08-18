import OpenAI from 'npm:openai@7.5.0';
import { z } from 'npm:zod@4.4.3';
import { authenticatedUser, serviceClient } from '../_shared/auth.ts';
import { corsHeaders, json, safeError } from '../_shared/http.ts';
import {
  deterministic,
  type Diagnostic,
  diagnosticSchema,
  inputSchema,
} from '../_shared/diagnostic.ts';
import {
  assertProviderImages,
  createOpenAiProvider,
  DIAGNOSTIC_PROMPT_VERSION,
  type ProviderImage,
} from '../_shared/ai-provider.ts';
import { detectMime } from '../_shared/upload-security.ts';

type ServiceDb = ReturnType<typeof serviceClient>;
type UploadRow = {
  id: string;
  purpose: string;
  status: string;
  user_id: string;
  target_bucket: string;
  final_path: string | null;
  detected_mime_type: string | null;
  declared_mime_type: string;
  size_bytes: number;
};

async function authorizeAndLoadImages(
  db: ServiceDb,
  userId: string,
  uploadIds: readonly string[],
): Promise<{ uploads: UploadRow[]; images: ProviderImage[] }> {
  if (!uploadIds.length) return { uploads: [], images: [] };
  const { data, error } = await db.from('file_uploads').select(
    'id,purpose,status,user_id,target_bucket,final_path,detected_mime_type,declared_mime_type,size_bytes',
  ).in('id', uploadIds);
  const uploads = (data ?? []) as UploadRow[];
  if (
    error || uploads.length !== uploadIds.length ||
    uploads.some((upload) =>
      upload.user_id !== userId || upload.status !== 'clean' || upload.final_path === null ||
      !['request_media', 'request_audio'].includes(upload.purpose)
    )
  ) throw new Error('CLEAN_AI_MEDIA_REQUIRED');
  const images: ProviderImage[] = [];
  for (const upload of uploads.filter((item) => item.purpose === 'request_media')) {
    const mimeType = upload.detected_mime_type ?? upload.declared_mime_type;
    if (!['image/jpeg', 'image/png', 'image/webp'].includes(mimeType)) {
      throw new Error('AI_IMAGE_MIME_REJECTED');
    }
    const { data: object, error: downloadError } = await db.storage
      .from(upload.target_bucket)
      .download(upload.final_path!);
    if (downloadError || !object) throw new Error('AI_IMAGE_DOWNLOAD_FAILED');
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.byteLength !== upload.size_bytes || detectMime(bytes, mimeType) !== mimeType) {
      throw new Error('AI_IMAGE_REVALIDATION_FAILED');
    }
    images.push({ uploadId: upload.id, mimeType: mimeType as ProviderImage['mimeType'], bytes });
  }
  assertProviderImages(images);
  return { uploads, images };
}
Deno.serve(async (request) => {
  const correlationId = crypto.randomUUID();
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== 'POST') return json(request, { error: 'method_not_allowed' }, 405);
  const started = Date.now();
  try {
    const user = await authenticatedUser(request);
    const input = inputSchema.parse(await request.json());
    const db = serviceClient();
    const windowStart = new Date();
    windowStart.setUTCMinutes(0, 0, 0);
    const key = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(user.id));
    const keyHash = Array.from(new Uint8Array(key))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
    const { data: allowed, error: rateError } = await db.rpc('consume_rate_limit', {
      p_key_hash: keyHash,
      p_operation: 'ai_diagnostic',
      p_window_start: windowStart.toISOString(),
      p_limit: 30,
    });
    if (rateError || allowed !== true) throw new Error('RATE_LIMIT');
    const promptVersion = await db.from('ai_prompt_versions').select('id')
      .eq('purpose', 'diagnostic').eq('version', DIAGNOSTIC_PROMPT_VERSION).eq('enabled', true)
      .maybeSingle();
    if (promptVersion.error || !promptVersion.data) {
      throw new Error('AI_PROMPT_VERSION_NOT_CONFIGURED');
    }
    let authorizedMedia: Awaited<ReturnType<typeof authorizeAndLoadImages>> | null = null;
    if (!input.sessionId) {
      authorizedMedia = await authorizeAndLoadImages(db, user.id, input.mediaUploadIds);
      if (input.inputKind === 'image' && authorizedMedia.images.length === 0) {
        throw new Error('AI_IMAGE_REQUIRED');
      }
    }
    let sessionId = input.sessionId;
    if (sessionId) {
      const { data: session, error: sessionError } = await db
        .from('ai_sessions')
        .select('id,user_id,status')
        .eq('id', sessionId)
        .eq('user_id', user.id)
        .eq('status', 'active')
        .maybeSingle();
      if (sessionError || !session) throw new Error('AI_SESSION_ACCESS_DENIED');
    } else {
      const { data: session, error: sessionError } = await db
        .from('ai_sessions')
        .insert({
          user_id: user.id,
          purpose: 'service_request_intake',
          status: 'active',
          locale: input.locale,
          prompt_version_id: promptVersion.data.id,
        })
        .select('id')
        .single();
      if (sessionError || !session) throw new Error('AI_SESSION_CREATE_FAILED');
      sessionId = session.id;
    }
    const clientMessageId = input.clientMessageId ?? crypto.randomUUID();
    const lastUserMessage = [...input.messages].reverse().find((message) =>
      message.role === 'user'
    );
    if (!lastUserMessage) throw new Error('USER_MESSAGE_REQUIRED');
    const existingMessage = await db
      .from('ai_messages')
      .select('id,sequence_number,original_content,metadata')
      .eq('session_id', sessionId)
      .eq('client_message_id', clientMessageId)
      .maybeSingle();
    if (existingMessage.error) throw new Error('AI_MESSAGE_LOOKUP_FAILED');
    let persistedUserMessage: { id: string };
    let userSequence: number;
    if (existingMessage.data) {
      const persistedMedia = z.array(z.string()).safeParse(
        existingMessage.data.metadata?.mediaUploadIds,
      );
      if (
        existingMessage.data.original_content !== lastUserMessage.text ||
        !persistedMedia.success ||
        JSON.stringify(persistedMedia.data) !== JSON.stringify(input.mediaUploadIds)
      ) throw new Error('CLIENT_MESSAGE_ID_CONFLICT');
      const latest = await db
        .from('ai_diagnostics')
        .select('structured_output')
        .eq('source_message_id', existingMessage.data.id)
        .maybeSingle();
      if (latest.error) throw new Error('AI_DIAGNOSTIC_REPLAY_FAILED');
      if (latest.data) {
        const replay = diagnosticSchema.parse(latest.data.structured_output);
        replay.metadata.sessionId = sessionId;
        return json(request, replay);
      }
      persistedUserMessage = { id: existingMessage.data.id };
      userSequence = existingMessage.data.sequence_number;
    } else {
      authorizedMedia ??= await authorizeAndLoadImages(db, user.id, input.mediaUploadIds);
      if (input.inputKind === 'image' && authorizedMedia.images.length === 0) {
        throw new Error('AI_IMAGE_REQUIRED');
      }
      const sequenceQuery = await db
        .from('ai_messages')
        .select('sequence_number')
        .eq('session_id', sessionId)
        .order('sequence_number', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (sequenceQuery.error) throw new Error('AI_SEQUENCE_LOOKUP_FAILED');
      userSequence = (sequenceQuery.data?.sequence_number ?? 0) + 1;
      const { data, error: userMessageError } = await db
        .from('ai_messages')
        .insert({
          session_id: sessionId,
          actor: 'user',
          original_content: lastUserMessage.text,
          redacted_content: lastUserMessage.text,
          sequence_number: userSequence,
          client_message_id: clientMessageId,
          input_kind: input.inputKind,
          metadata: { mediaUploadIds: input.mediaUploadIds },
        })
        .select('id')
        .single();
      if (userMessageError || !data) throw new Error('AI_MESSAGE_PERSIST_FAILED');
      persistedUserMessage = data;
    }
    const { uploads, images } = authorizedMedia ??
      await authorizeAndLoadImages(db, user.id, input.mediaUploadIds);
    if (input.inputKind === 'image' && images.length === 0) throw new Error('AI_IMAGE_REQUIRED');
    if (input.mediaUploadIds.length) {
      const { error: mediaError } = await db.from('ai_message_media').upsert(
        uploads.map((upload) => ({
          message_id: persistedUserMessage.id,
          file_upload_id: upload.id,
          media_kind: upload.purpose === 'request_audio' ? 'voice' : 'image',
        })),
        { onConflict: 'file_upload_id', ignoreDuplicates: true },
      );
      if (mediaError) throw new Error('AI_MEDIA_BIND_FAILED');
    }
    const { data: historyRows, error: historyError } = await db
      .from('ai_messages')
      .select('actor,original_content,sequence_number')
      .eq('session_id', sessionId)
      .in('actor', ['user', 'assistant'])
      .order('sequence_number', { ascending: true });
    if (historyError) throw new Error('AI_HISTORY_LOAD_FAILED');
    const historyInput = inputSchema.parse({
      ...input,
      sessionId,
      clientMessageId,
      messages: (historyRows ?? []).map((message) => ({
        role: message.actor,
        text: message.original_content,
      })),
    });
    let result: Diagnostic;
    let success = true;
    let category: null | string = null;
    const providerName = Deno.env.get('AI_PROVIDER') ?? 'deterministic';
    const model = Deno.env.get('AI_MODEL') ?? 'gpt-5.4-nano';
    const supportsImages = Deno.env.get('AI_MODEL_SUPPORTS_IMAGES') === 'true';
    try {
      if (providerName === 'openai' && images.length && !supportsImages) {
        result = deterministic(historyInput);
        success = false;
        category = 'model_without_vision';
      } else if (providerName === 'openai') {
        const apiKey = Deno.env.get('OPENAI_API_KEY');
        if (!apiKey) throw new Error('PROVIDER_NOT_CONFIGURED');
        const client = new OpenAI({ apiKey });
        const provider = createOpenAiProvider(
          client as unknown as Parameters<typeof createOpenAiProvider>[0],
          model,
          supportsImages,
        );
        result = await provider.diagnose(historyInput, images);
      } else {
        result = deterministic(historyInput);
      }
    } catch {
      result = deterministic(historyInput);
      success = false;
      category = 'provider_fallback';
    }
    if (!result.enoughInformation && !input.summaryRequested) {
      result.customerSummary = null;
      result.providerBrief = null;
    }
    result.metadata = {
      ...result.metadata,
      sessionId,
      turnNumber: (historyRows ?? []).filter((message) => message.actor === 'user').length,
      historyPreserved: true,
      categoryConfirmed: Boolean(input.confirmedCategorySlug),
      visionInputCount: images.length,
      visionMode: images.length === 0
        ? 'not_requested'
        : success && providerName === 'openai'
        ? 'provider'
        : 'text_fallback',
      summaryRequested: input.summaryRequested,
    };
    const assistantText = result.followUpQuestions[0] ??
      result.confirmationQuestion;
    const existingAssistant = await db.from('ai_messages').select('id')
      .eq('in_reply_to_message_id', persistedUserMessage.id).eq('actor', 'assistant').maybeSingle();
    if (existingAssistant.error) throw new Error('AI_RESPONSE_LOOKUP_FAILED');
    if (!existingAssistant.data) {
      const { error: assistantError } = await db.from('ai_messages').insert({
        session_id: sessionId,
        actor: 'assistant',
        original_content: assistantText,
        redacted_content: assistantText,
        sequence_number: userSequence + 1,
        input_kind: 'system',
        in_reply_to_message_id: persistedUserMessage.id,
        metadata: {
          enoughInformation: result.enoughInformation,
          fallback: result.metadata.fallback,
        },
      });
      if (assistantError) throw new Error('AI_RESPONSE_PERSIST_FAILED');
    }
    const { data: diagnostic, error: diagnosticError } = await db
      .from('ai_diagnostics')
      .insert({
        session_id: sessionId,
        source_message_id: persistedUserMessage.id,
        schema_version: result.schemaVersion,
        provider: result.metadata.provider,
        model: result.metadata.model,
        prompt_version: result.metadata.promptVersion,
        structured_output: result,
        fallback_source: result.metadata.fallback ? 'deterministic' : null,
        latency_ms: Date.now() - started,
        error_category: category,
      })
      .select('id')
      .single();
    if (diagnosticError || !diagnostic) throw new Error('AI_DIAGNOSTIC_PERSIST_FAILED');
    const { error: sessionUpdateError } = await db
      .from('ai_sessions')
      .update({
        provider: result.metadata.provider,
        model: result.metadata.model,
        prompt_version_id: promptVersion.data.id,
        suggested_category_slug: result.suggestedCategorySlug,
        confirmed_category_slug: input.confirmedCategorySlug,
        summary_requested_at: input.summaryRequested ? new Date().toISOString() : null,
        latest_diagnostic_id: diagnostic.id,
        updated_at: new Date().toISOString(),
        version: Math.ceil((userSequence + 1) / 2),
      })
      .eq('id', sessionId)
      .eq('user_id', user.id);
    if (sessionUpdateError) throw new Error('AI_SESSION_UPDATE_FAILED');
    await db.from('ai_usage_events').insert({
      user_id: user.id,
      session_id: sessionId,
      provider: result.metadata.provider,
      model: result.metadata.model,
      operation: 'diagnostic',
      success,
      error_category: category,
      latency_ms: Date.now() - started,
    });
    return json(request, result);
  } catch (error) {
    return safeError(request, error, correlationId);
  }
});
