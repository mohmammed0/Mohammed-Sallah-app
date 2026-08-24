import {
  MAX_UPLOAD_BYTES,
  type AcceptedImageMimeType,
  type UploadMimeType,
  type UploadPurpose,
} from './contracts.js';

export type MediaPolicyErrorCode =
  | 'aborted'
  | 'animated_or_multipage_image'
  | 'extension_mismatch'
  | 'image_decode_failed'
  | 'image_limits_exceeded'
  | 'malformed_media'
  | 'media_limits_exceeded'
  | 'mime_signature_mismatch'
  | 'output_metadata_forbidden'
  | 'polyglot_or_trailing_data'
  | 'unsupported_media'
  | 'unsupported_purpose_media';

export class MediaPolicyError extends Error {
  override readonly name = 'MediaPolicyError';

  constructor(readonly code: MediaPolicyErrorCode) {
    super(code);
  }
}

const allowedPurposeImages: Readonly<Record<UploadPurpose, ReadonlySet<AcceptedImageMimeType>>> = {
  request_media: new Set(['image/jpeg', 'image/png', 'image/webp']),
  request_audio: new Set(),
  provider_document: new Set(['image/jpeg', 'image/png']),
  completion_proof: new Set(['image/jpeg', 'image/png', 'image/webp']),
  support_evidence: new Set(['image/jpeg', 'image/png']),
  message_attachment: new Set(['image/jpeg', 'image/png', 'image/webp']),
};

const allowedExtensions: Readonly<Record<AcceptedImageMimeType, ReadonlySet<string>>> = {
  'image/jpeg': new Set(['jpg', 'jpeg']),
  'image/png': new Set(['png']),
  'image/webp': new Set(['webp']),
};

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  try {
    return new TextDecoder('ascii', { fatal: true }).decode(bytes.subarray(start, start + length));
  } catch {
    throw new MediaPolicyError('malformed_media');
  }
}

export function detectMediaFamily(bytes: Uint8Array): UploadMimeType | 'iso-bmff' | 'ebml' {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (bytes.byteLength >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') {
    return 'image/webp';
  }
  if (bytes.byteLength >= 8 && ascii(bytes, 4, 4) === 'ftyp') return 'iso-bmff';
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3])) return 'ebml';
  if (bytes.byteLength >= 5 && ascii(bytes, 0, 5) === '%PDF-') return 'application/pdf';
  throw new MediaPolicyError('unsupported_media');
}

export function assertAcceptedImagePolicy(input: {
  readonly bytes: Uint8Array;
  readonly purpose: UploadPurpose;
  readonly declaredMimeType: UploadMimeType;
  readonly extension: string;
  readonly detectedFamily: UploadMimeType | 'iso-bmff' | 'ebml';
  readonly signal?: AbortSignal;
}): asserts input is typeof input & {
  declaredMimeType: AcceptedImageMimeType;
  detectedFamily: AcceptedImageMimeType;
} {
  if (input.signal?.aborted) throw new MediaPolicyError('aborted');
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new MediaPolicyError('media_limits_exceeded');
  }
  if (
    input.declaredMimeType !== 'image/jpeg' &&
    input.declaredMimeType !== 'image/png' &&
    input.declaredMimeType !== 'image/webp'
  ) {
    throw new MediaPolicyError('unsupported_media');
  }
  if (
    input.detectedFamily !== 'image/jpeg' &&
    input.detectedFamily !== 'image/png' &&
    input.detectedFamily !== 'image/webp'
  ) {
    throw new MediaPolicyError('unsupported_media');
  }
  if (!allowedPurposeImages[input.purpose].has(input.declaredMimeType)) {
    throw new MediaPolicyError('unsupported_purpose_media');
  }
  if (!allowedExtensions[input.declaredMimeType].has(input.extension.toLowerCase())) {
    throw new MediaPolicyError('extension_mismatch');
  }
  if (input.detectedFamily !== input.declaredMimeType) {
    throw new MediaPolicyError('mime_signature_mismatch');
  }
}

const allowedRemuxExtensions: Readonly<Record<'audio/mp4' | 'video/mp4', ReadonlySet<string>>> = {
  'audio/mp4': new Set(['m4a', 'mp4']),
  'video/mp4': new Set(['mp4']),
};

export function assertAcceptedRemuxPolicy(input: {
  readonly bytes: Uint8Array;
  readonly purpose: UploadPurpose;
  readonly declaredMimeType: UploadMimeType;
  readonly extension: string;
  readonly detectedFamily: UploadMimeType | 'iso-bmff' | 'ebml';
  readonly signal?: AbortSignal;
}): asserts input is typeof input & { declaredMimeType: 'audio/mp4' | 'video/mp4' } {
  if (input.signal?.aborted) throw new MediaPolicyError('aborted');
  if (input.bytes.byteLength === 0 || input.bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw new MediaPolicyError('media_limits_exceeded');
  }
  if (input.detectedFamily !== 'iso-bmff') {
    throw new MediaPolicyError('mime_signature_mismatch');
  }
  if (input.declaredMimeType === 'audio/mp4') {
    if (input.purpose !== 'request_audio') {
      throw new MediaPolicyError('unsupported_purpose_media');
    }
  } else if (input.declaredMimeType === 'video/mp4') {
    if (input.purpose !== 'completion_proof') {
      throw new MediaPolicyError('unsupported_purpose_media');
    }
  } else {
    throw new MediaPolicyError('unsupported_media');
  }
  if (!allowedRemuxExtensions[input.declaredMimeType].has(input.extension.toLowerCase())) {
    throw new MediaPolicyError('extension_mismatch');
  }
}
