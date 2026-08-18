import { z } from 'zod';
import { supabase } from './supabase';

const unboundPurposeSchema = z.enum(['request_media', 'request_audio', 'provider_document']);
const resourcePurposeSchema = z.enum([
  'completion_proof',
  'support_evidence',
  'message_attachment',
]);
const ticketSchema = z.object({
  uploadId: z.uuid(),
  bucket: z.literal('quarantine'),
  path: z.string().min(1).max(500),
  contentType: z.string().min(1).max(100),
  expiresAt: z.string(),
});
const cleanUploadSchema = z.object({
  uploadId: z.uuid(),
  status: z.literal('clean'),
  storagePath: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(100),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(20 * 1024 * 1024),
  contentHash: z.string().regex(/^[0-9a-f]{64}$/),
});
const functionResponseSchema = z.object({
  data: z.unknown(),
  error: z.unknown().nullable(),
});

type UnboundPurpose = z.infer<typeof unboundPurposeSchema>;
type ResourcePurpose = z.infer<typeof resourcePurposeSchema>;

type SecureUploadInput = {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
} & (
  { purpose: UnboundPurpose; resourceId?: never } | { purpose: ResourcePurpose; resourceId: string }
);

export type CleanUpload = z.infer<typeof cleanUploadSchema>;

export async function secureUpload(input: SecureUploadInput): Promise<CleanUpload> {
  const ticketResponse =
    'resourceId' in input
      ? await supabase.rpc('create_resource_file_upload', {
          p_purpose: resourcePurposeSchema.parse(input.purpose),
          p_resource_id: z.uuid().parse(input.resourceId),
          p_filename: input.filename,
          p_declared_mime_type: input.mimeType,
          p_size_bytes: input.bytes.byteLength,
        })
      : await supabase.rpc('create_unbound_file_upload', {
          p_purpose: unboundPurposeSchema.parse(input.purpose),
          p_filename: input.filename,
          p_declared_mime_type: input.mimeType,
          p_size_bytes: input.bytes.byteLength,
        });
  if (ticketResponse.error) throw new Error('UPLOAD_TICKET_FAILED');
  const ticket = ticketSchema.parse(ticketResponse.data);
  const { error: uploadError } = await supabase.storage
    .from(ticket.bucket)
    .upload(ticket.path, input.bytes, {
      contentType: ticket.contentType,
      cacheControl: '0',
      upsert: false,
    });
  if (uploadError) throw new Error('QUARANTINE_UPLOAD_FAILED');
  const rawScanResponse: unknown = await supabase.functions.invoke<unknown>('scan-upload', {
    body: { uploadId: ticket.uploadId },
  });
  const scanResponse = functionResponseSchema.parse(rawScanResponse);
  if (scanResponse.error) throw new Error('UPLOAD_SCAN_FAILED');
  return cleanUploadSchema.parse(scanResponse.data);
}
