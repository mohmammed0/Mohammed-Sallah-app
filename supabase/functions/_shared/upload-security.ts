import { z } from 'npm:zod@4.4.3';

export const uploadInputSchema = z.object({ uploadId: z.uuid() }).strict();
export const uploadTicketSchema = z.object({
  uploadId: z.uuid(),
  userId: z.uuid(),
  purpose: z.enum([
    'request_media',
    'request_audio',
    'provider_document',
    'completion_proof',
    'support_evidence',
    'message_attachment',
  ]),
  quarantineBucket: z.literal('quarantine'),
  quarantinePath: z.string().min(1).max(500),
  targetBucket: z.string().min(1).max(100),
  targetPath: z.string().min(1).max(500),
  declaredMimeType: z.enum([
    'image/jpeg',
    'image/png',
    'image/webp',
    'video/mp4',
    'audio/mp4',
    'audio/webm',
    'application/pdf',
  ]),
  extension: z.string().min(1).max(8),
  sizeBytes: z.number().int().positive(),
  maxSizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
});
export type UploadTicket = z.infer<typeof uploadTicketSchema>;

const externalScanSchema = z
  .object({
    verdict: z.enum(['clean', 'malicious']),
    detectedMimeType: z.string().min(1).max(100),
    sanitized: z.boolean(),
    sanitizedBase64: z.string().max(30_000_000).optional(),
    category: z.string().min(1).max(160).optional(),
  })
  .strict();

const textDecoder = new TextDecoder('latin1');
const eicarMarker = 'EICAR-STANDARD-ANTIVIRUS-TEST-FILE';

export class UploadScanError extends Error {
  constructor(
    message: string,
    readonly terminal = true,
  ) {
    super(message);
  }
}

function startsWith(bytes: Uint8Array, signature: readonly number[]): boolean {
  return signature.every((value, index) => bytes[index] === value);
}

function ascii(bytes: Uint8Array, start: number, length: number): string {
  return textDecoder.decode(bytes.subarray(start, start + length));
}

export function detectMime(bytes: Uint8Array, declaredMimeType: string): string {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg';
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png';
  if (ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
  if (ascii(bytes, 0, 5) === '%PDF-') return 'application/pdf';
  if (ascii(bytes, 4, 4) === 'ftyp') {
    return declaredMimeType === 'audio/mp4' ? 'audio/mp4' : 'video/mp4';
  }
  if (startsWith(bytes, [0x1a, 0x45, 0xdf, 0xa3]) && declaredMimeType === 'audio/webm') {
    return 'audio/webm';
  }
  throw new UploadScanError('unknown_file_signature');
}

function validateExtension(extension: string, mimeType: string): void {
  const allowed: Record<string, readonly string[]> = {
    'image/jpeg': ['jpg', 'jpeg'],
    'image/png': ['png'],
    'image/webp': ['webp'],
    'video/mp4': ['mp4'],
    'audio/mp4': ['m4a', 'mp4'],
    'audio/webm': ['webm'],
    'application/pdf': ['pdf'],
  };
  if (!allowed[mimeType]?.includes(extension.toLowerCase())) {
    throw new UploadScanError('extension_signature_mismatch');
  }
}

function stripJpegMetadata(bytes: Uint8Array): Uint8Array {
  if (
    !startsWith(bytes, [0xff, 0xd8]) || !startsWith(bytes.subarray(bytes.length - 2), [0xff, 0xd9])
  ) {
    throw new UploadScanError('invalid_jpeg_structure');
  }
  const parts: Uint8Array[] = [bytes.subarray(0, 2)];
  let offset = 2;
  while (offset < bytes.length - 2) {
    if (bytes[offset] !== 0xff) throw new UploadScanError('invalid_jpeg_marker');
    const marker = bytes[offset + 1];
    if (marker === undefined) throw new UploadScanError('truncated_jpeg');
    if (marker === 0xda) {
      if (offset + 4 > bytes.length) throw new UploadScanError('truncated_jpeg_scan');
      const scanLength = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
      if (scanLength < 2 || offset + 2 + scanLength > bytes.length) {
        throw new UploadScanError('invalid_jpeg_scan');
      }
      parts.push(bytes.subarray(offset));
      break;
    }
    if (marker === 0xd9) {
      parts.push(bytes.subarray(offset, offset + 2));
      break;
    }
    if (offset + 4 > bytes.length) throw new UploadScanError('truncated_jpeg_segment');
    const length = ((bytes[offset + 2] ?? 0) << 8) | (bytes[offset + 3] ?? 0);
    if (length < 2 || offset + 2 + length > bytes.length) {
      throw new UploadScanError('invalid_jpeg_segment');
    }
    const isMetadata = (marker >= 0xe1 && marker <= 0xef) || marker === 0xfe;
    if (!isMetadata) parts.push(bytes.subarray(offset, offset + 2 + length));
    offset += 2 + length;
  }
  const length = parts.reduce((total, part) => total + part.length, 0);
  const result = new Uint8Array(length);
  let cursor = 0;
  for (const part of parts) {
    result.set(part, cursor);
    cursor += part.length;
  }
  return result;
}

const crcTable = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = (crcTable[(crc ^ byte) & 0xff] ?? 0) ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const result = new Uint8Array(12 + data.length);
  const view = new DataView(result.buffer);
  view.setUint32(0, data.length);
  const typeBytes = new TextEncoder().encode(type);
  result.set(typeBytes, 4);
  result.set(data, 8);
  view.setUint32(8 + data.length, crc32(result.subarray(4, 8 + data.length)));
  return result;
}

function stripPngMetadata(bytes: Uint8Array): Uint8Array {
  if (!startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) {
    throw new UploadScanError('invalid_png_signature');
  }
  const parts: Uint8Array[] = [bytes.subarray(0, 8)];
  const retained = new Set(['IHDR', 'PLTE', 'IDAT', 'IEND', 'tRNS']);
  let offset = 8;
  let sawHeader = false;
  let sawData = false;
  let sawEnd = false;
  while (offset + 12 <= bytes.length) {
    const view = new DataView(bytes.buffer, bytes.byteOffset + offset);
    const length = view.getUint32(0);
    if (length > 20 * 1024 * 1024 || offset + 12 + length > bytes.length) {
      throw new UploadScanError('invalid_png_chunk');
    }
    const type = ascii(bytes, offset + 4, 4);
    if (!/^[A-Za-z]{4}$/.test(type)) throw new UploadScanError('invalid_png_chunk_type');
    if (type === 'IHDR') sawHeader = true;
    if (type === 'IDAT') sawData = true;
    if (type === 'IEND') sawEnd = true;
    if (retained.has(type)) {
      parts.push(pngChunk(type, bytes.subarray(offset + 8, offset + 8 + length)));
    }
    offset += 12 + length;
    if (type === 'IEND') break;
  }
  if (!sawHeader || !sawData || !sawEnd) throw new UploadScanError('incomplete_png');
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const result = new Uint8Array(total);
  let cursor = 0;
  for (const part of parts) {
    result.set(part, cursor);
    cursor += part.length;
  }
  return result;
}

function rejectActivePdfContent(bytes: Uint8Array): void {
  const text = ascii(bytes, 0, Math.min(bytes.length, 2_000_000));
  if (!text.includes('%%EOF')) throw new UploadScanError('invalid_pdf_structure');
  if (/\/(JavaScript|JS|Launch|EmbeddedFile|RichMedia)\b/i.test(text)) {
    throw new UploadScanError('active_pdf_content');
  }
}

function bytesFromBase64(encoded: string): Uint8Array {
  try {
    return Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0));
  } catch {
    throw new UploadScanError('invalid_scanner_payload', false);
  }
}

export interface ScanResult {
  bytes: Uint8Array;
  detectedMimeType: string;
  sanitized: boolean;
  scanner: string;
}

export function deterministicScan(
  bytes: Uint8Array,
  declaredMimeType: string,
  extension: string,
): ScanResult {
  if (bytes.length === 0 || textDecoder.decode(bytes).includes(eicarMarker)) {
    throw new UploadScanError('malware_signature_detected');
  }
  const detectedMimeType = detectMime(bytes, declaredMimeType);
  if (detectedMimeType !== declaredMimeType) throw new UploadScanError('mime_signature_mismatch');
  validateExtension(extension, detectedMimeType);
  if (detectedMimeType === 'application/pdf') rejectActivePdfContent(bytes);
  const processed = detectedMimeType === 'image/jpeg'
    ? stripJpegMetadata(bytes)
    : detectedMimeType === 'image/png'
    ? stripPngMetadata(bytes)
    : bytes;
  return {
    bytes: processed,
    detectedMimeType,
    sanitized: processed !== bytes,
    scanner: 'deterministic-signature-v1',
  };
}

export async function externalScan(
  bytes: Uint8Array,
  ticket: UploadTicket,
  endpoint: string,
  secret: string,
): Promise<ScanResult> {
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${secret}`,
      'Content-Type': 'application/octet-stream',
      'X-Declared-Mime-Type': ticket.declaredMimeType,
      'X-File-Extension': ticket.extension,
      'X-Upload-Purpose': ticket.purpose,
    },
    body: new Blob([bytes.slice().buffer], { type: 'application/octet-stream' }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new UploadScanError('external_scanner_unavailable', false);
  const parsed = externalScanSchema.safeParse(await response.json());
  if (!parsed.success) throw new UploadScanError('invalid_scanner_response', false);
  if (parsed.data.verdict === 'malicious') {
    throw new UploadScanError(parsed.data.category ?? 'malware_detected');
  }
  if (parsed.data.detectedMimeType !== ticket.declaredMimeType) {
    throw new UploadScanError('mime_signature_mismatch');
  }
  validateExtension(ticket.extension, parsed.data.detectedMimeType);
  const isImage = parsed.data.detectedMimeType.startsWith('image/');
  if (isImage && (!parsed.data.sanitized || !parsed.data.sanitizedBase64)) {
    throw new UploadScanError('image_sanitization_required', false);
  }
  return {
    bytes: parsed.data.sanitizedBase64 ? bytesFromBase64(parsed.data.sanitizedBase64) : bytes,
    detectedMimeType: parsed.data.detectedMimeType,
    sanitized: parsed.data.sanitized,
    scanner: 'external-malware-sanitizer-v1',
  };
}

export async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', bytes.slice().buffer);
  return Array.from(new Uint8Array(digest)).map((value) => value.toString(16).padStart(2, '0'))
    .join('');
}
