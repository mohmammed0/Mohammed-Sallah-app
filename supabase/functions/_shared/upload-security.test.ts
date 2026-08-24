import { assertEquals, assertThrows } from 'jsr:@std/assert@1';
import { detectMime, UploadMediaTypeError } from './upload-security.ts';

Deno.test('clean-object MIME discriminator recognizes the supported static image prefixes', () => {
  assertEquals(detectMime(new Uint8Array([0xff, 0xd8, 0xff]), 'image/jpeg'), 'image/jpeg');
  assertEquals(
    detectMime(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png'),
    'image/png',
  );
  assertEquals(
    detectMime(new TextEncoder().encode('RIFF0000WEBP'), 'image/webp'),
    'image/webp',
  );
});

Deno.test('clean-object MIME discriminator fails closed on unknown input', () => {
  assertThrows(
    () => detectMime(new TextEncoder().encode('not media'), 'image/png'),
    UploadMediaTypeError,
    'unknown_file_signature',
  );
});
