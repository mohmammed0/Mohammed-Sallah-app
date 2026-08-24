import { Transformer } from '@napi-rs/image';

import { MAX_UPLOAD_BYTES, type AcceptedImageMimeType } from './contracts.js';
import { MediaPolicyError } from './media-policy.js';

export const MAX_IMAGE_DIMENSION = 8_192;
export const MAX_IMAGE_PIXELS = 40_000_000;
const MAX_IMAGE_ELEMENTS = 1_024;
const asciiDecoder = new TextDecoder('latin1');

interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

interface NativeImageMetadata extends ImageDimensions {
  readonly colorType: number;
  readonly format: string;
}

function fail(code: MediaPolicyError['code']): never {
  throw new MediaPolicyError(code);
}

function assertDimensions(value: ImageDimensions): void {
  if (
    !Number.isSafeInteger(value.width) ||
    !Number.isSafeInteger(value.height) ||
    value.width <= 0 ||
    value.height <= 0 ||
    value.width > MAX_IMAGE_DIMENSION ||
    value.height > MAX_IMAGE_DIMENSION ||
    value.width * value.height > MAX_IMAGE_PIXELS
  ) {
    fail('image_limits_exceeded');
  }
}

function assertBoundedNativeMetadata(
  value: NativeImageMetadata,
  mimeType: AcceptedImageMimeType,
): void {
  assertDimensions(value);
  if (
    value.format.toLowerCase() !== mimeType.slice('image/'.length) ||
    !Number.isInteger(value.colorType) ||
    value.colorType < 0 ||
    value.colorType > 3
  ) {
    fail('image_decode_failed');
  }
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function parsePng(bytes: Uint8Array, output: boolean): ImageDimensions {
  if (
    bytes.byteLength < 33 ||
    ![0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a].every(
      (value, index) => bytes[index] === value,
    )
  )
    fail('image_decode_failed');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 8;
  let elements = 0;
  let dimensions: ImageDimensions | undefined;
  let imageData = false;
  while (offset + 12 <= bytes.byteLength) {
    if (++elements > MAX_IMAGE_ELEMENTS) fail('image_decode_failed');
    const length = view.getUint32(offset);
    const type = asciiDecoder.decode(bytes.subarray(offset + 4, offset + 8));
    const end = offset + 12 + length;
    if (end > bytes.byteLength) fail('image_decode_failed');
    if (
      crc32(bytes.subarray(offset + 4, offset + 8 + length)) !== view.getUint32(offset + 8 + length)
    ) {
      fail('image_decode_failed');
    }
    if (elements === 1) {
      if (type !== 'IHDR' || length !== 13) fail('image_decode_failed');
      dimensions = { width: view.getUint32(offset + 8), height: view.getUint32(offset + 12) };
    }
    if (type === 'acTL' || type === 'fcTL' || type === 'fdAT') {
      fail('animated_or_multipage_image');
    }
    if (output && ['iCCP', 'eXIf', 'tEXt', 'zTXt', 'iTXt'].includes(type)) {
      fail('output_metadata_forbidden');
    }
    if (type === 'IDAT') imageData = true;
    if (type === 'IEND') {
      if (length !== 0 || !imageData || !dimensions) fail('image_decode_failed');
      if (end !== bytes.byteLength) fail('polyglot_or_trailing_data');
      return dimensions;
    }
    offset = end;
  }
  return fail('image_decode_failed');
}

const frameMarkers = new Set([
  0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
]);

function parseJpeg(bytes: Uint8Array, output: boolean): ImageDimensions {
  if (bytes.byteLength < 4 || bytes[0] !== 0xff || bytes[1] !== 0xd8) fail('image_decode_failed');
  let offset = 2;
  let elements = 0;
  let dimensions: ImageDimensions | undefined;
  let frames = 0;
  let inEntropy = false;
  while (offset < bytes.byteLength) {
    if (inEntropy) {
      if (bytes[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      while (bytes[offset] === 0xff) offset += 1;
      const entropyMarker = bytes[offset];
      if (
        entropyMarker === 0x00 ||
        (entropyMarker !== undefined && entropyMarker >= 0xd0 && entropyMarker <= 0xd7)
      ) {
        offset += 1;
        continue;
      }
      inEntropy = false;
      offset -= 1;
      continue;
    }
    if (++elements > MAX_IMAGE_ELEMENTS * 16) fail('image_decode_failed');
    if (bytes[offset] !== 0xff || offset + 1 >= bytes.byteLength) fail('image_decode_failed');
    while (bytes[offset] === 0xff) offset += 1;
    const marker = bytes[offset];
    offset += 1;
    if (marker === 0xd8) fail('animated_or_multipage_image');
    if (marker === 0xd9) {
      if (!dimensions || frames !== 1) fail('image_decode_failed');
      if (offset !== bytes.byteLength) {
        if (bytes[offset] === 0xff && bytes[offset + 1] === 0xd8) {
          fail('animated_or_multipage_image');
        }
        fail('polyglot_or_trailing_data');
      }
      return dimensions;
    }
    if (marker === 0x01 || (marker !== undefined && marker >= 0xd0 && marker <= 0xd7)) continue;
    if (marker === undefined || offset + 2 > bytes.byteLength) fail('image_decode_failed');
    const length = ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
    if (length < 2 || offset + length > bytes.byteLength) fail('image_decode_failed');
    const payload = bytes.subarray(offset + 2, offset + length);
    const text = asciiDecoder.decode(payload.subarray(0, Math.min(payload.byteLength, 128)));
    if (marker === 0xe2 && text.startsWith('MPF\0')) fail('animated_or_multipage_image');
    if (output && [0xe1, 0xe2, 0xed, 0xfe].includes(marker)) fail('output_metadata_forbidden');
    if (frameMarkers.has(marker)) {
      frames += 1;
      if (frames !== 1 || length < 7) fail('animated_or_multipage_image');
      dimensions = {
        height: ((bytes[offset + 3] ?? 0) << 8) | (bytes[offset + 4] ?? 0),
        width: ((bytes[offset + 5] ?? 0) << 8) | (bytes[offset + 6] ?? 0),
      };
    }
    offset += length;
    if (marker === 0xda) inEntropy = true;
  }
  return fail('image_decode_failed');
}

function uint24LittleEndian(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16);
}

function parseWebp(bytes: Uint8Array, output: boolean): ImageDimensions {
  if (
    bytes.byteLength < 20 ||
    asciiDecoder.decode(bytes.subarray(0, 4)) !== 'RIFF' ||
    asciiDecoder.decode(bytes.subarray(8, 12)) !== 'WEBP'
  )
    fail('image_decode_failed');
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const declaredEnd = view.getUint32(4, true) + 8;
  if (declaredEnd !== bytes.byteLength) fail('polyglot_or_trailing_data');
  let offset = 12;
  let elements = 0;
  let dimensions: ImageDimensions | undefined;
  let imageChunks = 0;
  while (offset + 8 <= declaredEnd) {
    if (++elements > MAX_IMAGE_ELEMENTS) fail('image_decode_failed');
    const type = asciiDecoder.decode(bytes.subarray(offset, offset + 4));
    const length = view.getUint32(offset + 4, true);
    const payload = offset + 8;
    const end = payload + length;
    const paddedEnd = end + (length % 2);
    if (end > declaredEnd || paddedEnd > declaredEnd) fail('image_decode_failed');
    if (type === 'ANIM' || type === 'ANMF') fail('animated_or_multipage_image');
    if (output && ['ICCP', 'EXIF', 'XMP '].includes(type)) fail('output_metadata_forbidden');
    if (type === 'VP8X') {
      if (length !== 10) fail('image_decode_failed');
      if (((bytes[payload] ?? 0) & 0x02) !== 0) fail('animated_or_multipage_image');
      dimensions = {
        width: uint24LittleEndian(bytes, payload + 4) + 1,
        height: uint24LittleEndian(bytes, payload + 7) + 1,
      };
    } else if (type === 'VP8L') {
      imageChunks += 1;
      if (length < 5 || bytes[payload] !== 0x2f) fail('image_decode_failed');
      const bits = view.getUint32(payload + 1, true);
      dimensions = { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    } else if (type === 'VP8 ') {
      imageChunks += 1;
      if (
        length < 10 ||
        bytes[payload + 3] !== 0x9d ||
        bytes[payload + 4] !== 0x01 ||
        bytes[payload + 5] !== 0x2a
      )
        fail('image_decode_failed');
      dimensions ??= {
        width: view.getUint16(payload + 6, true) & 0x3fff,
        height: view.getUint16(payload + 8, true) & 0x3fff,
      };
    }
    offset = paddedEnd;
  }
  if (offset !== declaredEnd || imageChunks !== 1 || !dimensions) fail('image_decode_failed');
  return dimensions;
}

export function assertStaticImageStructure(
  bytes: Uint8Array,
  mimeType: AcceptedImageMimeType,
  options: { readonly output: boolean },
): ImageDimensions {
  const dimensions =
    mimeType === 'image/png'
      ? parsePng(bytes, options.output)
      : mimeType === 'image/jpeg'
        ? parseJpeg(bytes, options.output)
        : parseWebp(bytes, options.output);
  assertDimensions(dimensions);
  return dimensions;
}

export async function reopenAndFullyValidateImageOutput(
  bytes: Uint8Array,
  mimeType: AcceptedImageMimeType,
  expectedDimensions: ImageDimensions,
  signal?: AbortSignal,
): Promise<void> {
  if (signal?.aborted) fail('aborted');
  const structure = assertStaticImageStructure(bytes, mimeType, { output: true });
  try {
    const reopened = new Transformer(bytes);
    const metadata = await reopened.metadata(false, signal);
    assertBoundedNativeMetadata(metadata, mimeType);
    if (
      structure.width !== expectedDimensions.width ||
      structure.height !== expectedDimensions.height ||
      metadata.width !== expectedDimensions.width ||
      metadata.height !== expectedDimensions.height
    )
      fail('image_decode_failed');
    const pixels = await reopened.rawPixels(signal);
    const channels = metadata.colorType + 1;
    if (pixels.byteLength !== metadata.width * metadata.height * channels) {
      fail('image_decode_failed');
    }
  } catch (error) {
    if (error instanceof MediaPolicyError) throw error;
    if (signal?.aborted) fail('aborted');
    fail('image_decode_failed');
  }
}

export interface SanitizedImage {
  readonly bytes: Uint8Array;
  readonly sanitizerId: string;
}

export async function sanitizeImage(
  bytes: Uint8Array,
  mimeType: AcceptedImageMimeType,
  signal?: AbortSignal,
): Promise<SanitizedImage> {
  if (signal?.aborted) fail('aborted');
  const inputDimensions = assertStaticImageStructure(bytes, mimeType, { output: false });
  try {
    const transformer = new Transformer(bytes);
    const decoded = await transformer.metadata(false, signal);
    assertBoundedNativeMetadata(decoded, mimeType);
    if (decoded.width !== inputDimensions.width || decoded.height !== inputDimensions.height) {
      fail('image_decode_failed');
    }
    const encoded =
      mimeType === 'image/jpeg'
        ? await transformer.jpeg(90, signal)
        : mimeType === 'image/png'
          ? await transformer.png(undefined, signal)
          : await transformer.webp(90, signal);
    if (encoded.byteLength === 0 || encoded.byteLength > MAX_UPLOAD_BYTES) {
      fail('media_limits_exceeded');
    }
    const output = Uint8Array.from(encoded);
    await reopenAndFullyValidateImageOutput(output, mimeType, inputDimensions, signal);
    return { bytes: output, sanitizerId: `decode-reencode-${mimeType.slice(6)}-v1` };
  } catch (error) {
    if (error instanceof MediaPolicyError) throw error;
    if (signal?.aborted) fail('aborted');
    fail('image_decode_failed');
  }
}
