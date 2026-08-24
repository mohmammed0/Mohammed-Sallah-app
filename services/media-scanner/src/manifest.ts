import { createHash } from 'node:crypto';

import { z } from 'zod';

import { hmacSha256Hex } from './auth.js';
import { acceptedMediaMimeTypeSchema } from './contracts.js';

const uuid = z.uuid();
const hash = z.string().regex(/^[0-9a-f]{64}$/);
const boundedVersion = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/);
export const opaqueReferenceSchema = z
  .string()
  .min(41)
  .max(160)
  .regex(
    /^[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
  );

export const SCANNER_ATTESTATION_VERSION = 'sallah-media-attestation-v1' as const;

export const scannerAttestationSchema = z
  .object({
    schemaVersion: z.literal(SCANNER_ATTESTATION_VERSION),
    attemptId: uuid,
    inputRef: opaqueReferenceSchema,
    outputRef: opaqueReferenceSchema,
    purpose: z.enum([
      'request_media',
      'request_audio',
      'provider_document',
      'completion_proof',
      'support_evidence',
      'message_attachment',
    ]),
    detectedInputMime: acceptedMediaMimeTypeSchema,
    detectedOutputMime: acceptedMediaMimeTypeSchema,
    inputSize: z
      .number()
      .int()
      .positive()
      .max(20 * 1024 * 1024),
    outputSize: z
      .number()
      .int()
      .positive()
      .max(20 * 1024 * 1024),
    inputSha256: hash,
    outputSha256: hash,
    originalScan: z.literal('clean'),
    finalScan: z.literal('clean'),
    sanitized: z.literal(true),
    sanitizer: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
    sanitizerVersion: boundedVersion,
    clamavEngineVersion: boundedVersion,
    signatureVersion: boundedVersion,
    signatureTimestamp: z.iso.datetime({ offset: true }),
    signatureAgeSeconds: z.number().int().min(0).max(604_800),
    processingDurationMs: z.number().int().min(0).max(120_000),
    jobDeadline: z.iso.datetime({ offset: true }),
    nonce: uuid,
    correlationId: uuid,
    readbackSha256: hash,
    storageFingerprint: z.string().regex(/^[0-9a-f]{32,64}$/),
  })
  .strict();

export type ScannerAttestation = z.infer<typeof scannerAttestationSchema>;

export class AttestationError extends Error {
  override readonly name = 'AttestationError';

  constructor() {
    super('invalid_attestation');
  }
}

export function parseAttestation(value: unknown): ScannerAttestation {
  const result = scannerAttestationSchema.safeParse(value);
  if (!result.success) throw new AttestationError();
  return result.data;
}

export function canonicalAttestation(value: ScannerAttestation): string {
  return JSON.stringify(parseAttestation(value));
}

export function fingerprintAttestation(value: ScannerAttestation): string {
  return createHash('sha256').update(canonicalAttestation(value), 'utf8').digest('hex');
}

export function signAttestation(value: ScannerAttestation, secret: string): string {
  try {
    return hmacSha256Hex(secret, canonicalAttestation(value));
  } catch {
    throw new AttestationError();
  }
}
