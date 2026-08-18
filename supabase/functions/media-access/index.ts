import { z } from 'npm:zod@4.4.3';
import { authenticatedUser, serviceClient } from '../_shared/auth.ts';
import { corsHeaders, json, safeError } from '../_shared/http.ts';

const inputSchema = z.object({
  uploadId: z.uuid(),
  expiresInSeconds: z.number().int().min(60).max(900).default(300),
});
const authorizationSchema = z.object({
  bucket: z.string().min(1).max(120),
  path: z.string().min(1).max(1024),
  mimeType: z.string().min(1).max(160),
  sizeBytes: z.number().int().positive(),
  uploadId: z.uuid(),
});

Deno.serve(async (request) => {
  const correlationId = crypto.randomUUID();
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== 'POST') return json(request, { error: 'method_not_allowed' }, 405);
  try {
    const user = await authenticatedUser(request);
    const input = inputSchema.parse(await request.json());
    const db = serviceClient();
    const { data, error } = await db.rpc('authorize_clean_media', {
      p_user_id: user.id,
      p_upload_id: input.uploadId,
    });
    if (error || !data) throw new Error('MEDIA_ACCESS_DENIED');
    const authorized = authorizationSchema.parse(data);
    const { data: signed, error: signError } = await db.storage
      .from(authorized.bucket)
      .createSignedUrl(authorized.path, input.expiresInSeconds);
    if (signError || !signed?.signedUrl) throw new Error('MEDIA_SIGNING_FAILED');
    const signedUrl = new URL(signed.signedUrl, request.url);
    if (signedUrl.hostname === 'kong') {
      const environment = Deno.env.get('APP_ENV') ?? 'local';
      const configuredPublicUrl = Deno.env.get('SUPABASE_PUBLIC_URL');
      if (!configuredPublicUrl && !['local', 'test'].includes(environment)) {
        throw new Error('PUBLIC_STORAGE_URL_NOT_CONFIGURED');
      }
      const publicOrigin = new URL(configuredPublicUrl ?? 'http://127.0.0.1:54321');
      signedUrl.protocol = publicOrigin.protocol;
      signedUrl.host = publicOrigin.host;
    }
    return json(request, {
      uploadId: authorized.uploadId,
      mimeType: authorized.mimeType,
      sizeBytes: authorized.sizeBytes,
      signedUrl: signedUrl.toString(),
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
      correlationId,
    });
  } catch (error) {
    return safeError(request, error, correlationId);
  }
});
