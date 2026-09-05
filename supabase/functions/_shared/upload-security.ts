const latin1 = new TextDecoder('latin1');

export class UploadMediaTypeError extends Error {
  constructor(readonly category = 'unknown_file_signature') {
    super(category);
  }
}

function startsWith(value: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((byte, index) => value[index] === byte);
}

function ascii(value: Uint8Array, offset: number, length: number): string {
  return latin1.decode(value.subarray(offset, offset + length));
}

/**
 * Small signature discriminator used only after authorization of an already-clean object.
 * It is not a sanitizer, malware scan, polyglot defense, or promotion boundary.
 */
export function detectMime(value: Uint8Array, declaredMimeType: string): string {
  if (startsWith(value, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(value, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    return 'image/png';
  }
  if (ascii(value, 0, 4) === 'RIFF' && ascii(value, 8, 4) === 'WEBP') return 'image/webp';
  if (ascii(value, 0, 5) === '%PDF-') return 'application/pdf';
  if (ascii(value, 4, 4) === 'ftyp') {
    return declaredMimeType === 'audio/mp4' ? 'audio/mp4' : 'video/mp4';
  }
  if (startsWith(value, [0x1a, 0x45, 0xdf, 0xa3]) && declaredMimeType === 'audio/webm') {
    return 'audio/webm';
  }
  throw new UploadMediaTypeError();
}
