import { z } from 'npm:zod@4.4.3';
import { authenticatedUser, serviceClient } from '../_shared/auth.ts';
import { corsHeaders, json } from '../_shared/http.ts';
import {
  deterministicScan,
  externalScan,
  sha256Hex,
  uploadInputSchema,
  UploadScanError,
  type UploadTicket,
  uploadTicketSchema,
} from '../_shared/upload-security.ts';

const completionSchema = z.object({
  uploadId: z.uuid(),
  status: z.literal('clean'),
  storagePath: z.string().min(1),
  mimeType: z.string().min(1),
  sizeBytes: z.number().int().positive(),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
});

async function reportFailure(
  ticket: UploadTicket,
  category: string,
  terminal: boolean,
  scanner: string,
): Promise<void> {
  const db = serviceClient();
  const { error } = terminal
    ? await db.rpc('reject_file_upload', {
      p_upload_id: ticket.uploadId,
      p_user_id: ticket.userId,
      p_failure_category: category,
      p_scanner: scanner,
    })
    : await db.rpc('fail_file_upload', {
      p_upload_id: ticket.uploadId,
      p_user_id: ticket.userId,
      p_failure_category: category,
      p_scanner: scanner,
    });
  if (error) console.error(JSON.stringify({ event: 'upload_failure_report_failed' }));
}

async function scan(ticket: UploadTicket, bytes: Uint8Array) {
  const environment = Deno.env.get('APP_ENV') ?? 'local';
  const mode = Deno.env.get('UPLOAD_SCANNER_MODE') ?? 'deterministic';
  if (environment === 'production' && mode !== 'external') {
    throw new UploadScanError('production_scanner_not_configured', false);
  }
  if (mode === 'external') {
    const endpoint = Deno.env.get('UPLOAD_SCANNER_URL');
    const secret = Deno.env.get('UPLOAD_SCANNER_SECRET');
    if (!endpoint || !secret || secret.length < 24) {
      throw new UploadScanError('external_scanner_not_configured', false);
    }
    return await externalScan(bytes, ticket, endpoint, secret);
  }
  if (mode !== 'deterministic') throw new UploadScanError('invalid_scanner_mode', false);
  return deterministicScan(bytes, ticket.declaredMimeType, ticket.extension);
}

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: corsHeaders(request) });
  }
  if (request.method !== 'POST') return json(request, { error: 'method_not_allowed' }, 405);

  let ticket: UploadTicket | null = null;
  try {
    const user = await authenticatedUser(request);
    const input = uploadInputSchema.parse(await request.json());
    const db = serviceClient();
    const { data: claimed, error: claimError } = await db.rpc('claim_file_upload', {
      p_upload_id: input.uploadId,
      p_user_id: user.id,
    });
    if (claimError || !claimed) throw new UploadScanError('upload_not_claimable');
    ticket = uploadTicketSchema.parse(claimed);

    const { data: object, error: downloadError } = await db.storage
      .from(ticket.quarantineBucket)
      .download(ticket.quarantinePath);
    if (downloadError || !object) throw new UploadScanError('quarantine_download_failed', false);
    const bytes = new Uint8Array(await object.arrayBuffer());
    if (bytes.length !== ticket.sizeBytes || bytes.length > ticket.maxSizeBytes) {
      throw new UploadScanError('uploaded_size_mismatch');
    }

    const result = await scan(ticket, bytes);
    if (result.bytes.length > ticket.maxSizeBytes) {
      throw new UploadScanError('sanitized_file_too_large');
    }
    const contentHash = await sha256Hex(result.bytes);
    const { error: promoteError } = await db.storage
      .from(ticket.targetBucket)
      .upload(ticket.targetPath, result.bytes, {
        contentType: result.detectedMimeType,
        cacheControl: '0',
        upsert: false,
      });
    if (promoteError) throw new UploadScanError('clean_file_promotion_failed', false);

    const { data: completed, error: completionError } = await db.rpc('complete_file_upload', {
      p_upload_id: ticket.uploadId,
      p_user_id: ticket.userId,
      p_detected_mime_type: result.detectedMimeType,
      p_size_bytes: result.bytes.length,
      p_content_sha256: contentHash,
      p_final_path: ticket.targetPath,
      p_scanner: result.scanner,
      p_sanitized: result.sanitized,
    });
    if (completionError || !completed) {
      await db.storage.from(ticket.targetBucket).remove([ticket.targetPath]);
      throw new UploadScanError('upload_completion_failed', false);
    }
    const parsed = completionSchema.parse(completed);
    const { error: quarantineDeleteError } = await db.storage
      .from(ticket.quarantineBucket)
      .remove([ticket.quarantinePath]);
    if (quarantineDeleteError) {
      console.error(JSON.stringify({ event: 'quarantine_cleanup_deferred' }));
    }
    return json(request, parsed);
  } catch (error) {
    const scanError = error instanceof UploadScanError
      ? error
      : new UploadScanError('unexpected_scan_failure', false);
    if (ticket) {
      await reportFailure(
        ticket,
        scanError.message,
        scanError.terminal,
        Deno.env.get('UPLOAD_SCANNER_MODE') ?? 'deterministic',
      );
    }
    console.error(JSON.stringify({ event: 'upload_scan_failed', category: scanError.message }));
    return json(
      request,
      { error: scanError.terminal ? 'file_rejected' : 'scanner_unavailable' },
      scanError.terminal ? 422 : 503,
    );
  }
});
