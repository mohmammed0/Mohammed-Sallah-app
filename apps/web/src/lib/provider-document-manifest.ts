import { z } from 'zod';

const providerDocumentSchema = z
  .object({
    id: z.uuid(),
    uploadId: z.uuid(),
    documentType: z.string().min(1).max(80),
    mimeType: z.string().min(1).max(100),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(20 * 1024 * 1024),
    status: z.string().min(1).max(40),
    expiresAt: z.iso.date().nullable(),
    createdAt: z.iso.datetime({ offset: true }),
  })
  .strict();

const providerDocumentManifestSchema = z
  .object({
    providerId: z.uuid(),
    documents: z.array(providerDocumentSchema).max(20),
  })
  .strict();

const providerDocumentAccessResponseSchema = z
  .object({
    uploadId: z.uuid(),
    mimeType: z.string().min(1).max(160),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(20 * 1024 * 1024),
    deliveryMode: z.enum(['signed_url', 'authenticated_proxy']),
    signedUrl: z.url().refine((value) => new URL(value).protocol === 'https:', {
      message: 'Provider document access must use HTTPS',
    }),
    expiresAt: z.iso.datetime({ offset: true }),
    correlationId: z.uuid(),
  })
  .strict();

export type ProviderDocumentManifest = z.infer<typeof providerDocumentManifestSchema>;
export interface ProviderDocumentAccess {
  signedUrl: string;
  expiresAt: string;
}

export function parseProviderDocumentManifest(
  value: unknown,
  expectedProviderId: string,
): ProviderDocumentManifest {
  const expected = z.uuid().parse(expectedProviderId);
  const parsed = providerDocumentManifestSchema.parse(value);
  if (parsed.providerId !== expected) throw new Error('PROVIDER_DOCUMENT_MANIFEST_MISMATCH');
  return parsed;
}

export function parseProviderDocumentAccess(
  value: unknown,
  expected: { uploadId: string; mimeType: string; sizeBytes: number },
): ProviderDocumentAccess {
  const parsed = providerDocumentAccessResponseSchema.parse(value);
  if (
    parsed.uploadId !== expected.uploadId ||
    parsed.mimeType !== expected.mimeType ||
    parsed.sizeBytes !== expected.sizeBytes
  ) {
    throw new Error('PROVIDER_DOCUMENT_ACCESS_MISMATCH');
  }
  return { signedUrl: parsed.signedUrl, expiresAt: parsed.expiresAt };
}
