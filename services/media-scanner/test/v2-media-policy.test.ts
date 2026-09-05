import { Transformer } from '@napi-rs/image';
import { describe, expect, it } from 'vitest';

import {
  assertStaticImageStructure,
  MAX_IMAGE_DIMENSION,
  MAX_IMAGE_PIXELS,
  reopenAndFullyValidateImageOutput,
  sanitizeImage,
} from '../src/image-sanitizer.js';
import { assertAcceptedRemuxPolicy, detectMediaFamily } from '../src/media-policy.js';
import { sanitizeMedia } from '../src/sanitize.js';
import {
  animatedWebpInput,
  apngInput,
  jpegExecutablePolyglot,
  jpegMpoInput,
  onePixelJpeg,
  onePixelPng,
  onePixelWebp,
  pngNativeDecodeFailure,
  pngPdfPolyglot,
  pngZipPolyglot,
  progressiveOnePixelJpeg,
  withJpegIcc,
  withJpegComment,
  withJpegExif,
  withJpegExtendedXmp,
  withJpegStandardXmp,
} from './fixtures/v2-media.js';

async function representativeLargeJpeg(): Promise<Uint8Array> {
  const width = 512;
  const height = 512;
  const pixels = new Uint8Array(width * height * 4);
  let state = 0x9e37_79b9;
  for (let index = 0; index < pixels.byteLength; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    pixels[index] = state & 0xff;
  }
  return Uint8Array.from(await Transformer.fromRgbaPixels(pixels, width, height).jpeg(90));
}

function crc32(bytes: Uint8Array): number {
  let crc = 0xffff_ffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let bit = 0; bit < 8; bit += 1) {
      crc = (crc & 1) === 1 ? 0xedb8_8320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffff_ffff) >>> 0;
}

function pngDimensionBomb(): Uint8Array {
  const result = onePixelPng.slice();
  const view = new DataView(result.buffer, result.byteOffset, result.byteLength);
  view.setUint32(16, MAX_IMAGE_DIMENSION + 1);
  view.setUint32(20, Math.ceil(MAX_IMAGE_PIXELS / (MAX_IMAGE_DIMENSION + 1)));
  view.setUint32(29, crc32(result.subarray(12, 29)));
  return result;
}

function jpegWithExcessiveSegments(): Uint8Array {
  const segments = Array.from({ length: 16_385 }, () => [0xff, 0xe0, 0, 2]).flat();
  return Uint8Array.from([
    ...onePixelJpeg.subarray(0, 2),
    ...segments,
    ...onePixelJpeg.subarray(2),
  ]);
}

function webpWithExcessiveChunks(): Uint8Array {
  const chunk = Uint8Array.of(0x4a, 0x55, 0x4e, 0x4b, 0, 0, 0, 0);
  const result = new Uint8Array(12 + chunk.byteLength * 1_025 + onePixelWebp.byteLength - 12);
  result.set(onePixelWebp.subarray(0, 12));
  for (let index = 0; index < 1_025; index += 1) result.set(chunk, 12 + index * chunk.byteLength);
  result.set(onePixelWebp.subarray(12), 12 + chunk.byteLength * 1_025);
  new DataView(result.buffer).setUint32(4, result.byteLength - 8, true);
  return result;
}

describe('V2 static-image-only content policy', () => {
  it.each([
    ['audio/mp4', 'request_audio', 'm4a'],
    ['audio/mp4', 'request_audio', 'mp4'],
    ['video/mp4', 'completion_proof', 'mp4'],
  ] as const)(
    'admits %s only to the bounded remux policy for %s',
    (declaredMimeType, purpose, extension) => {
      const bytes = Uint8Array.of(
        0,
        0,
        0,
        24,
        0x66,
        0x74,
        0x79,
        0x70,
        0x4d,
        0x34,
        0x41,
        0x20,
        0,
        0,
        0,
        0,
        0x4d,
        0x34,
        0x41,
        0x20,
        0x69,
        0x73,
        0x6f,
        0x6d,
      );
      const candidate = {
        bytes,
        purpose,
        declaredMimeType,
        extension,
        detectedFamily: detectMediaFamily(bytes),
      };
      expect(() => assertAcceptedRemuxPolicy(candidate)).not.toThrow();
    },
  );

  it.each([
    ['image/png', 'png', onePixelPng],
    ['image/jpeg', 'jpg', onePixelJpeg],
    ['image/webp', 'webp', onePixelWebp],
  ] as const)(
    'fully decodes, re-encodes, reopens, and validates %s to exact EOF',
    async (mime, extension, bytes) => {
      const result = await sanitizeMedia({
        bytes,
        purpose: 'request_media',
        declaredMimeType: mime,
        extension,
      });

      expect(result.detectedMimeType).toBe(mime);
      expect(result.sanitized).toBe(true);
      expect(() => assertStaticImageStructure(result.bytes, mime, { output: true })).not.toThrow();
    },
  );

  it.each([
    ['PNG+ZIP', 'image/png', 'png', pngZipPolyglot()],
    ['image+PDF', 'image/png', 'png', pngPdfPolyglot()],
    ['JPEG+executable', 'image/jpeg', 'jpg', jpegExecutablePolyglot()],
  ] as const)(
    'rejects %s input rather than sanitizing a polyglot',
    async (_name, mime, extension, bytes) => {
      await expect(
        sanitizeMedia({ bytes, purpose: 'request_media', declaredMimeType: mime, extension }),
      ).rejects.toMatchObject({ code: 'polyglot_or_trailing_data' });
    },
  );

  it.each([
    ['APNG', 'image/png', 'png', apngInput()],
    ['animated WebP', 'image/webp', 'webp', animatedWebpInput()],
    ['JPEG MPO', 'image/jpeg', 'jpg', jpegMpoInput()],
    ['concatenated JPEG', 'image/jpeg', 'jpg', new Uint8Array([...onePixelJpeg, ...onePixelJpeg])],
  ] as const)(
    'rejects animated or multipage %s before native allocation',
    async (_name, mime, extension, bytes) => {
      await expect(
        sanitizeMedia({ bytes, purpose: 'request_media', declaredMimeType: mime, extension }),
      ).rejects.toMatchObject({ code: 'animated_or_multipage_image' });
    },
  );

  it('strips ICC metadata and rejects it in a purported final output', async () => {
    const result = await sanitizeImage(withJpegIcc(), 'image/jpeg');
    expect(new TextDecoder('latin1').decode(result.bytes)).not.toContain('ICC_PROFILE');
    expect(() =>
      assertStaticImageStructure(withJpegIcc(), 'image/jpeg', { output: true }),
    ).toThrowError('output_metadata_forbidden');
  });

  it.each([
    ['EXIF', withJpegExif()],
    ['standard XMP', withJpegStandardXmp()],
    ['Extended XMP', withJpegExtendedXmp()],
    ['comment', withJpegComment()],
    ['ICC', withJpegIcc()],
  ] as const)('rejects %s metadata in a purported final JPEG', (_name, bytes) => {
    expect(() => assertStaticImageStructure(bytes, 'image/jpeg', { output: true })).toThrowError(
      'output_metadata_forbidden',
    );
  });

  it('accepts a representative large static JPEG beyond the former entropy-walk ceiling', async () => {
    const encoded = await representativeLargeJpeg();
    expect(encoded.byteLength).toBeGreaterThan(16_384);

    await expect(
      sanitizeMedia({
        bytes: encoded,
        purpose: 'request_media',
        declaredMimeType: 'image/jpeg',
        extension: 'jpg',
      }),
    ).resolves.toMatchObject({ detectedMimeType: 'image/jpeg', sanitized: true });
  });

  it('rejects dimensions and decoded pixel counts before native decode allocation', async () => {
    await expect(
      sanitizeMedia({
        bytes: pngDimensionBomb(),
        purpose: 'request_media',
        declaredMimeType: 'image/png',
        extension: 'png',
      }),
    ).rejects.toMatchObject({ code: 'image_limits_exceeded' });
  });

  it('bounds malformed JPEG marker and WebP chunk traversal before native decode', async () => {
    await expect(
      sanitizeMedia({
        bytes: jpegWithExcessiveSegments(),
        purpose: 'request_media',
        declaredMimeType: 'image/jpeg',
        extension: 'jpg',
      }),
    ).rejects.toMatchObject({ code: 'image_decode_failed' });
    await expect(
      sanitizeMedia({
        bytes: webpWithExcessiveChunks(),
        purpose: 'request_media',
        declaredMimeType: 'image/webp',
        extension: 'webp',
      }),
    ).rejects.toMatchObject({ code: 'image_decode_failed' });
  });

  it.each([
    ['image/jpeg', 'jpg', onePixelJpeg.subarray(0, 24)],
    ['image/png', 'png', onePixelPng.subarray(0, 24)],
    ['image/webp', 'webp', onePixelWebp.subarray(0, 16)],
  ] as const)('fails truncated %s input closed', async (declaredMimeType, extension, bytes) => {
    await expect(
      sanitizeMedia({ bytes, purpose: 'request_media', declaredMimeType, extension }),
    ).rejects.toMatchObject({ code: 'image_decode_failed' });
  });

  it('accepts a representative multi-scan progressive JPEG', async () => {
    expect(
      progressiveOnePixelJpeg.some(
        (byte, index) => byte === 0xff && progressiveOnePixelJpeg[index + 1] === 0xc2,
      ),
    ).toBe(true);

    await expect(
      sanitizeMedia({
        bytes: progressiveOnePixelJpeg,
        purpose: 'request_media',
        declaredMimeType: 'image/jpeg',
        extension: 'jpg',
      }),
    ).resolves.toMatchObject({ detectedMimeType: 'image/jpeg', sanitized: true });
  });

  it('rejects a structurally bounded image that the native decoder cannot decode', async () => {
    await expect(
      sanitizeMedia({
        bytes: pngNativeDecodeFailure(),
        purpose: 'request_media',
        declaredMimeType: 'image/png',
        extension: 'png',
      }),
    ).rejects.toMatchObject({ code: 'image_decode_failed' });
  });

  it('fully decodes a reopened output instead of trusting structural metadata alone', async () => {
    const corrupt = pngNativeDecodeFailure();
    expect(() => assertStaticImageStructure(corrupt, 'image/png', { output: true })).not.toThrow();
    await expect(
      reopenAndFullyValidateImageOutput(corrupt, 'image/png', { width: 1, height: 1 }),
    ).rejects.toMatchObject({ code: 'image_decode_failed' });
  });

  it('fails an MP4 with a trailing payload closed without producing output', async () => {
    await expect(
      sanitizeMedia({
        bytes: Uint8Array.of(
          0,
          0,
          0,
          16,
          0x66,
          0x74,
          0x79,
          0x70,
          0x69,
          0x73,
          0x6f,
          0x6d,
          0,
          0,
          0,
          0,
          ...new TextEncoder().encode('MZ-trailing-payload'),
        ),
        purpose: 'completion_proof',
        declaredMimeType: 'video/mp4',
        extension: 'mp4',
      }),
    ).rejects.toMatchObject({ code: 'unsupported_media' });
  });

  it.each([
    ['application/pdf', 'pdf', new TextEncoder().encode('%PDF-1.7')],
    ['audio/webm', 'webm', Uint8Array.of(0x1a, 0x45, 0xdf, 0xa3, 0x80)],
  ] as const)(
    'fails %s closed with no pass-through output',
    async (declaredMimeType, extension, bytes) => {
      await expect(
        sanitizeMedia({
          bytes,
          purpose: declaredMimeType.startsWith('audio/') ? 'request_audio' : 'completion_proof',
          declaredMimeType,
          extension,
        }),
      ).rejects.toMatchObject({ code: 'unsupported_media' });
    },
  );
});
