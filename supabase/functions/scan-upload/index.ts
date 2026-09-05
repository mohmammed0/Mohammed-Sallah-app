import { createClient } from 'npm:@supabase/supabase-js@2.112.3';
import { z } from 'npm:zod@4.4.3';
import { authenticatedUser } from '../_shared/auth.ts';
import { corsHeaders, json, safeError } from '../_shared/http.ts';
import { parseAppEnvironment, readBoundedJson } from '../_shared/scanner-control.ts';

const startInputSchema = z.object({
  uploadId: z.uuid(),
  action: z.literal('start'),
  operationId: z.uuid(),
}).strict();
const statusInputSchema = z.object({
  uploadId: z.uuid(),
  action: z.literal('status'),
}).strict();
const inputSchema = z.discriminatedUnion('action', [startInputSchema, statusInputSchema]);
const ownerStatusSchema = z.object({
  uploadId: z.uuid(),
  status: z.enum([
    'queued',
    'scanning',
    'clean',
    'rejected',
    'retryable_failure',
    'terminal_failure',
  ]),
  terminalCategory: z.string().max(80).nullable(),
  sanitized: z.boolean().nullable(),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'audio/mp4', 'video/mp4']).nullable(),
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024).nullable(),
  retryAt: z.iso.datetime({ offset: true }).nullable(),
  createdAt: z.iso.datetime({ offset: true }),
  updatedAt: z.iso.datetime({ offset: true }),
}).strict();
const databaseErrorSchema = z.object({ message: z.string() }).passthrough();

export interface UserScanClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown | null }>;
}

export interface ScanUploadDependencies {
  authenticate(request: Request): Promise<{ id: string }>;
  createUserClient(request: Request): UserScanClient;
  appEnvironment(): string | undefined;
  log(entry: Record<string, unknown>): void;
}

function defaultUserClient(request: Request): UserScanClient {
  const url = Deno.env.get('SUPABASE_URL');
  const publishable = Deno.env.get('SUPABASE_ANON_KEY') ?? Deno.env.get('SUPABASE_PUBLISHABLE_KEY');
  const authorization = request.headers.get('Authorization');
  if (!url || !publishable || !authorization) throw new Error('SERVER_CONFIG');
  return createClient(url, publishable, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: authorization } },
  });
}

const defaultDependencies: ScanUploadDependencies = {
  authenticate: authenticatedUser,
  createUserClient: defaultUserClient,
  appEnvironment: () => Deno.env.get('APP_ENV'),
  log: (entry) => console.log(JSON.stringify(entry)),
};

async function boundedInput(request: Request): Promise<unknown> {
  try {
    return (await readBoundedJson(request, 4096)).value;
  } catch {
    throw new Error('INVALID_SCAN_REQUEST');
  }
}

function safeOwnerResponse(value: unknown) {
  const parsed = ownerStatusSchema.parse(value);
  return {
    uploadId: parsed.uploadId,
    status: parsed.status,
    terminalCategory: parsed.terminalCategory,
    sanitized: parsed.sanitized,
    mimeType: parsed.mimeType,
    sizeBytes: parsed.sizeBytes,
    retryAt: parsed.retryAt,
  };
}

export function createScanUploadHandler(dependencies: ScanUploadDependencies) {
  return async (request: Request): Promise<Response> => {
    const correlationId = crypto.randomUUID();
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: corsHeaders(request) });
    }
    if (request.method !== 'POST') return json(request, { error: 'method_not_allowed' }, 405);
    try {
      try {
        parseAppEnvironment(dependencies.appEnvironment());
      } catch {
        throw new Error('SERVER_CONFIG');
      }
      const input = inputSchema.parse(await boundedInput(request));
      await dependencies.authenticate(request);
      const db = dependencies.createUserClient(request);
      const result = input.action === 'start'
        ? await db.rpc('start_or_get_media_scan', {
          p_upload_id: input.uploadId,
          p_operation_id: input.operationId,
        })
        : await db.rpc('get_my_file_upload_status', { p_upload_id: input.uploadId });
      if (result.error) {
        const databaseError = databaseErrorSchema.safeParse(result.error);
        if (
          input.action === 'start' && databaseError.success &&
          databaseError.data.message === 'QUARANTINE_UPLOAD_INCOMPLETE'
        ) {
          return json(request, {
            uploadId: input.uploadId,
            status: 'terminal_failure',
            terminalCategory: 'quarantine_upload_incomplete',
            sanitized: false,
            mimeType: null,
            sizeBytes: null,
            retryAt: null,
          });
        }
        throw new Error('MEDIA_SCAN_STATE_UNAVAILABLE');
      }
      const safe = safeOwnerResponse(result.data);
      dependencies.log({ event: 'media_scan_owner_state', status: safe.status, correlationId });
      return json(request, safe);
    } catch (error) {
      if (error instanceof z.ZodError) return json(request, { error: 'invalid_request' }, 400);
      return safeError(request, error, correlationId);
    }
  };
}

export const handleScanUpload = createScanUploadHandler(defaultDependencies);

if (import.meta.main) Deno.serve(handleScanUpload);
