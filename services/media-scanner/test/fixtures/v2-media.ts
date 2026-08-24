import { Buffer } from 'node:buffer';

const pngOnePixelBase64 =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==';
const jpegOnePixelBase64 =
  '/9j/4AAQSkZJRgABAgAAAQABAAD/wAARCAABAAEDAREAAhEBAxEB/9sAQwADAgIDAgIDAwMDBAMDBAUIBQUEBAUKBwcGCAwKDAwLCgsLDQ4SEA0OEQ4LCxAWEBETFBUVFQwPFxgWFBgSFBUU/9sAQwEDBAQFBAUJBQUJFA0LDRQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQU/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYGRomJygpKjU2Nzg5OkNERUZHSElKU1RVVldYWVpjZGVmZ2hpanN0dXZ3eHl6goOEhYaHiImKkpOUlZaXmJmaoqOkpaanqKmqsrO0tba3uLm6wsPExcbHyMnK0tPU1dbX2Nna4uPk5ebn6Onq8vP09fb3+Pn6/9oADAMBAAIRAxEAPwD50r8MP9Uz/9k=';
const webpOnePixelBase64 =
  'UklGRkAAAABXRUJQVlA4IDQAAAAwAgCdASoBAAEAAMASJaACdLoB+AH4AARoAAD++iGX/3easNN39a3/9aOfron+tHP/WVgA';
const progressiveJpegOnePixelBase64 =
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAMCAgMCAgMDAwMEAwMEBQgFBQQEBQoHBwYIDAoMDAsKCwsNDhIQDQ4RDgsLEBYQERMUFRUVDA8XGBYUGBIUFRT/2wBDAQMEBAUEBQkFBQkUDQsNFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBQUFBT/wgARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAf/xAAVAQEBAAAAAAAAAAAAAAAAAAAGCP/aAAwDAQACEAMQAAABnIC1T//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAQUCf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQMBAT8Bf//EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQIBAT8Bf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEABj8Cf//EABQQAQAAAAAAAAAAAAAAAAAAAAD/2gAIAQEAAT8hf//aAAwDAQACAAMAAAAQ/wD/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAEDAQE/EH//xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oACAECAQE/EH//xAAUEAEAAAAAAAAAAAAAAAAAAAAA/9oACAEBAAE/EH//2Q==';

export const onePixelPng = Uint8Array.from(Buffer.from(pngOnePixelBase64, 'base64'));
export const onePixelJpeg = Uint8Array.from(Buffer.from(jpegOnePixelBase64, 'base64'));
export const progressiveOnePixelJpeg = Uint8Array.from(
  Buffer.from(progressiveJpegOnePixelBase64, 'base64'),
);
export const onePixelWebp = Uint8Array.from(Buffer.from(webpOnePixelBase64, 'base64'));

export function concatBytes(...parts: readonly Uint8Array[]): Uint8Array {
  const output = new Uint8Array(parts.reduce((total, part) => total + part.byteLength, 0));
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.byteLength;
  }
  return output;
}

function ascii(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

function uint32(value: number): Uint8Array {
  return Uint8Array.of(value >>> 24, value >>> 16, value >>> 8, value);
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

function pngChunk(type: string, data: Uint8Array): Uint8Array {
  const typed = concatBytes(ascii(type), data);
  return concatBytes(uint32(data.byteLength), typed, uint32(crc32(typed)));
}

export function apngInput(): Uint8Array {
  const iend = onePixelPng.byteLength - 12;
  return concatBytes(
    onePixelPng.subarray(0, iend),
    pngChunk('acTL', concatBytes(uint32(2), uint32(0))),
    onePixelPng.subarray(iend),
  );
}

export function pngZipPolyglot(): Uint8Array {
  return concatBytes(onePixelPng, ascii('PK\x03\x04trailer'));
}

export function pngPdfPolyglot(): Uint8Array {
  return concatBytes(onePixelPng, ascii('%PDF-1.7 trailer'));
}

export function pngNativeDecodeFailure(): Uint8Array {
  const result = onePixelPng.slice();
  const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
  const idatOffset = 33;
  const length = view.getUint32(idatOffset);
  result[idatOffset + 8] = (result[idatOffset + 8] ?? 0) ^ 0xff;
  view.setUint32(
    idatOffset + 8 + length,
    crc32(result.subarray(idatOffset + 4, idatOffset + 8 + length)),
  );
  return result;
}

export function jpegExecutablePolyglot(): Uint8Array {
  return concatBytes(onePixelJpeg, ascii('MZ\x90\x00executable'));
}

export function jpegMpoInput(): Uint8Array {
  const payload = ascii('MPF\x00multi-picture');
  const length = payload.byteLength + 2;
  return concatBytes(
    onePixelJpeg.subarray(0, 2),
    Uint8Array.of(0xff, 0xe2, length >>> 8, length & 0xff),
    payload,
    onePixelJpeg.subarray(2),
  );
}

export function animatedWebpInput(): Uint8Array {
  const result = onePixelWebp.slice();
  result.set(ascii('VP8X'), 12);
  new DataView(result.buffer, result.byteOffset, result.byteLength).setUint32(16, 10, true);
  result[20] = 0x02;
  return result;
}

export function withJpegIcc(bytes = onePixelJpeg): Uint8Array {
  return withJpegSegment(0xe2, ascii('ICC_PROFILE\x00profile'), bytes);
}

function withJpegSegment(marker: number, payload: Uint8Array, bytes = onePixelJpeg): Uint8Array {
  const length = payload.byteLength + 2;
  return concatBytes(
    bytes.subarray(0, 2),
    Uint8Array.of(0xff, marker, length >>> 8, length & 0xff),
    payload,
    bytes.subarray(2),
  );
}

export function withJpegExif(bytes = onePixelJpeg): Uint8Array {
  return withJpegSegment(0xe1, ascii('Exif\x00\x00private'), bytes);
}

export function withJpegStandardXmp(bytes = onePixelJpeg): Uint8Array {
  return withJpegSegment(0xe1, ascii('http://ns.adobe.com/xap/1.0/\x00private'), bytes);
}

export function withJpegExtendedXmp(bytes = onePixelJpeg): Uint8Array {
  return withJpegSegment(0xe1, ascii('http://ns.adobe.com/xmp/extension/\x00private'), bytes);
}

export function withJpegComment(bytes = onePixelJpeg): Uint8Array {
  return withJpegSegment(0xfe, ascii('private comment'), bytes);
}
