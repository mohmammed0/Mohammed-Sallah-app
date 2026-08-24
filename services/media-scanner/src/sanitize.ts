import {
  MAX_UPLOAD_BYTES,
  SCANNER_SANITIZER_VERSION,
  type UploadMimeType,
  type UploadPurpose,
} from './contracts.js';
import { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS, sanitizeImage } from './image-sanitizer.js';
import { assertAcceptedImagePolicy, detectMediaFamily, MediaPolicyError } from './media-policy.js';

export { MAX_IMAGE_DIMENSION, MAX_IMAGE_PIXELS, MediaPolicyError };

export interface SanitizeMediaInput {
  readonly bytes: Uint8Array;
  readonly purpose: UploadPurpose;
  readonly declaredMimeType: UploadMimeType;
  readonly extension: string;
  readonly signal?: AbortSignal;
}

export interface SanitizedMedia {
  readonly bytes: Uint8Array;
  readonly detectedMimeType: 'image/jpeg' | 'image/png' | 'image/webp';
  readonly sanitized: true;
  readonly sanitizerId: string;
  readonly sanitizerVersion: typeof SCANNER_SANITIZER_VERSION;
}

export async function sanitizeMedia(input: SanitizeMediaInput): Promise<SanitizedMedia> {
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new MediaPolicyError('media_limits_exceeded');
  }
  const detectedFamily = detectMediaFamily(input.bytes);
  const candidate = { ...input, detectedFamily };
  assertAcceptedImagePolicy(candidate);
  const sanitized = await sanitizeImage(input.bytes, candidate.detectedFamily, input.signal);
  return {
    ...sanitized,
    detectedMimeType: candidate.detectedFamily,
    sanitized: true,
    sanitizerVersion: SCANNER_SANITIZER_VERSION,
  };
}
