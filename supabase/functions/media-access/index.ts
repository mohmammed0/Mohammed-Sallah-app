import { z } from 'npm:zod@4.4.3';
import { authenticatedUser, serviceClient } from '../_shared/auth.ts';
import { corsHeaders, json, safeError } from '../_shared/http.ts';
import { parseAppEnvironment } from '../_shared/scanner-control.ts';

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
  deliveryMode: z.enum(['signed_url', 'authenticated_proxy']).default('signed_url'),
});
const proxyQuerySchema = z.object({
  uploadId: z.uuid(),
  subject: z.uuid(),
  expiresAt: z.coerce.number().int().positive(),
  token: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
});

const encoder = new TextEncoder();
export const maxMessageProxyTtlSeconds = 120;

export function messageProxyLifetimeSeconds(requestedSeconds: number) {
  return Math.min(requestedSeconds, maxMessageProxyTtlSeconds);
}

const originSchema = z.string().refine((raw) => !/[\s\\\p{Cc}]/u.test(raw)).pipe(
  z.string().url().refine((raw) => {
    const url = new URL(raw);
    return ['http:', 'https:'].includes(url.protocol) &&
      !url.username && !url.password && url.pathname === '/' && !url.search && !url.hash;
  }).transform((raw) => new URL(raw)),
);
const localPortSchema = z.string().regex(/^[1-9]\d{0,4}$/).transform(Number).pipe(
  z.number().int().min(1).max(65535),
);
const loopbackHosts = new Set(['localhost', '127.0.0.1', '[::1]', '10.0.2.2']);

function mediaOrigins(environment: ReturnType<typeof parseAppEnvironment>) {
  const backend = originSchema.safeParse(Deno.env.get('SUPABASE_URL'));
  if (!backend.success) throw new Error('SERVER_CONFIG');
  const local = environment === 'local' || environment === 'test';
  const configured = Deno.env.get('SUPABASE_PUBLIC_URL');
  let publicOrigin: URL;
  if (configured !== undefined) {
    const parsed = originSchema.safeParse(configured);
    if (!parsed.success) throw new Error('PUBLIC_STORAGE_URL_NOT_CONFIGURED');
    publicOrigin = parsed.data;
  } else if (backend.data.protocol === 'https:' || loopbackHosts.has(backend.data.hostname)) {
    publicOrigin = new URL(backend.data.origin);
  } else if (local) {
    // The CLI supplies its actual gateway port, including isolated custom-port projects.
    const port = localPortSchema.safeParse(Deno.env.get('SUPABASE_INTERNAL_HOST_PORT') ?? '54321');
    if (!port.success) throw new Error('PUBLIC_STORAGE_URL_NOT_CONFIGURED');
    publicOrigin = new URL(`http://127.0.0.1:${port.data}`);
  } else {
    throw new Error('PUBLIC_STORAGE_URL_NOT_CONFIGURED');
  }
  if (
    (publicOrigin.protocol !== 'https:' && !(local && loopbackHosts.has(publicOrigin.hostname))) ||
    (!local && loopbackHosts.has(publicOrigin.hostname))
  ) throw new Error('PUBLIC_STORAGE_URL_NOT_CONFIGURED');
  return { backend: backend.data, publicOrigin };
}

type PrivateStorageStreamOptions = {
  supabaseUrl?: string;
  serviceRoleKey?: string;
  fetcher?: typeof fetch;
  connectTimeoutMs?: number;
};

export async function streamPrivateStorageObject(
  bucket: string,
  path: string,
  options: PrivateStorageStreamOptions = {},
) {
  const supabaseUrl = options.supabaseUrl ?? Deno.env.get('SUPABASE_URL');
  const serviceRoleKey = options.serviceRoleKey ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ??
    Deno.env.get('SUPABASE_SECRET_KEY');
  if (!supabaseUrl || !serviceRoleKey) throw new Error('SERVER_CONFIG');
  const storageUrl = new URL(
    `/storage/v1/object/authenticated/${encodeURIComponent(bucket)}/${
      path.split('/').map(encodeURIComponent).join('/')
    }`,
    supabaseUrl,
  );
  const connectController = new AbortController();
  const connectTimeout = setTimeout(
    () => connectController.abort(),
    options.connectTimeoutMs ?? 15_000,
  );
  let response: Response;
  try {
    response = await (options.fetcher ?? fetch)(storageUrl, {
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
      },
      signal: connectController.signal,
    });
  } finally {
    clearTimeout(connectTimeout);
  }
  if (!response.ok || !response.body) throw new Error('MEDIA_ACCESS_DENIED');
  return response;
}

function mediaCorsHeaders(request: Request): HeadersInit {
  return {
    ...corsHeaders(request),
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  };
}

function proxyPayload(subject: string, uploadId: string, expiresAt: number) {
  return `${subject}:${uploadId}:${expiresAt}`;
}

function base64Url(bytes: ArrayBuffer) {
  let binary = '';
  for (const byte of new Uint8Array(bytes)) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}

function base64UrlBytes(value: string) {
  const padded = value.replaceAll('-', '+').replaceAll('_', '/').padEnd(44, '=');
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

async function proxySigningKey() {
  const secret = Deno.env.get('SUPABASE_SECRET_KEY') ?? Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  if (!secret) throw new Error('SERVER_CONFIG');
  const derived = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(`sallah-message-media-proxy-v1:${secret}`),
  );
  return crypto.subtle.importKey('raw', derived, { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify',
  ]);
}

async function createProxyToken(subject: string, uploadId: string, expiresAt: number) {
  const signature = await crypto.subtle.sign(
    'HMAC',
    await proxySigningKey(),
    encoder.encode(proxyPayload(subject, uploadId, expiresAt)),
  );
  return base64Url(signature);
}

async function verifyProxyToken(input: z.infer<typeof proxyQuerySchema>) {
  if (
    input.expiresAt <= Date.now() ||
    input.expiresAt > Date.now() + maxMessageProxyTtlSeconds * 1000
  ) return false;
  return crypto.subtle.verify(
    'HMAC',
    await proxySigningKey(),
    base64UrlBytes(input.token),
    encoder.encode(proxyPayload(input.subject, input.uploadId, input.expiresAt)),
  );
}

export async function handleMediaAccess(request: Request) {
  const correlationId = crypto.randomUUID();
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: mediaCorsHeaders(request) });
  }
  try {
    const environment = parseAppEnvironment(Deno.env.get('APP_ENV'));
    if (request.method === 'GET') {
      const url = new URL(request.url);
      const input = proxyQuerySchema.parse(Object.fromEntries(url.searchParams));
      if (!(await verifyProxyToken(input))) throw new Error('MEDIA_ACCESS_DENIED');
      const db = serviceClient();
      const { data, error } = await db.rpc('authorize_protected_media', {
        p_user_id: input.subject,
        p_upload_id: input.uploadId,
      });
      if (error || !data) throw new Error('MEDIA_ACCESS_DENIED');
      const authorized = authorizationSchema.parse(data);
      if (authorized.deliveryMode !== 'authenticated_proxy') {
        throw new Error('MEDIA_ACCESS_DENIED');
      }
      const media = await streamPrivateStorageObject(authorized.bucket, authorized.path);
      return new Response(media.body, {
        status: media.status,
        headers: {
          ...mediaCorsHeaders(request),
          'Content-Type': media.headers.get('content-type') ?? authorized.mimeType,
          'Content-Length': media.headers.get('content-length') ?? String(authorized.sizeBytes),
          'Cache-Control': 'private, no-store, max-age=0',
        },
      });
    }
    if (request.method !== 'POST') return json(request, { error: 'method_not_allowed' }, 405);
    const user = await authenticatedUser(request);
    const input = inputSchema.parse(await request.json());
    const db = serviceClient();
    const { data, error } = await db.rpc('authorize_protected_media', {
      p_user_id: user.id,
      p_upload_id: input.uploadId,
    });
    if (error || !data) throw new Error('MEDIA_ACCESS_DENIED');
    const authorized = authorizationSchema.parse(data);
    if (authorized.deliveryMode === 'authenticated_proxy') {
      const expiresAt = Date.now() + messageProxyLifetimeSeconds(input.expiresInSeconds) * 1000;
      const { publicOrigin } = mediaOrigins(environment);
      const accessUrl = new URL('/functions/v1/media-access', publicOrigin);
      accessUrl.searchParams.set('uploadId', authorized.uploadId);
      accessUrl.searchParams.set('subject', user.id);
      accessUrl.searchParams.set('expiresAt', String(expiresAt));
      accessUrl.searchParams.set(
        'token',
        await createProxyToken(user.id, authorized.uploadId, expiresAt),
      );
      return json(request, {
        uploadId: authorized.uploadId,
        mimeType: authorized.mimeType,
        sizeBytes: authorized.sizeBytes,
        deliveryMode: authorized.deliveryMode,
        signedUrl: accessUrl.toString(),
        expiresAt: new Date(expiresAt).toISOString(),
        correlationId,
      });
    }
    const { data: signed, error: signError } = await db.storage
      .from(authorized.bucket)
      .createSignedUrl(authorized.path, input.expiresInSeconds);
    if (signError || !signed?.signedUrl) throw new Error('MEDIA_SIGNING_FAILED');
    const { backend, publicOrigin } = mediaOrigins(environment);
    const signedUrl = new URL(signed.signedUrl, backend);
    if (
      ![backend.origin, publicOrigin.origin].includes(signedUrl.origin) ||
      signedUrl.username || signedUrl.password || signedUrl.hash ||
      !signedUrl.pathname.startsWith('/storage/v1/object/sign/')
    ) throw new Error('MEDIA_SIGNING_FAILED');
    signedUrl.protocol = publicOrigin.protocol;
    signedUrl.hostname = publicOrigin.hostname;
    signedUrl.port = publicOrigin.port;
    return json(request, {
      uploadId: authorized.uploadId,
      mimeType: authorized.mimeType,
      sizeBytes: authorized.sizeBytes,
      deliveryMode: authorized.deliveryMode,
      signedUrl: signedUrl.toString(),
      expiresAt: new Date(Date.now() + input.expiresInSeconds * 1000).toISOString(),
      correlationId,
    });
  } catch (error) {
    return safeError(request, error, correlationId);
  }
}

if (import.meta.main) Deno.serve(handleMediaAccess);
