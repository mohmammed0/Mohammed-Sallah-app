import { deterministicScan, UploadScanError } from './upload-security.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test('deterministic scanner rejects the EICAR test marker', () => {
  const bytes = new TextEncoder().encode(
    'X5O!P%@AP[4\\PZX54(P^)7CC)7}$EICAR-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*',
  );
  let observed = '';
  try {
    deterministicScan(bytes, 'application/pdf', 'pdf');
  } catch (error) {
    observed = error instanceof UploadScanError ? error.message : 'unexpected';
  }
  assert(observed === 'malware_signature_detected', 'EICAR must be rejected');
});

Deno.test('deterministic scanner rejects MIME and magic-byte mismatches', () => {
  const pngSignature = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  let observed = '';
  try {
    deterministicScan(pngSignature, 'image/jpeg', 'jpg');
  } catch (error) {
    observed = error instanceof UploadScanError ? error.message : 'unexpected';
  }
  assert(observed === 'mime_signature_mismatch', 'spoofed MIME must be rejected');
});

Deno.test('JPEG sanitizer removes EXIF application metadata', () => {
  const bytes = new Uint8Array([
    0xff,
    0xd8,
    0xff,
    0xe1,
    0x00,
    0x06,
    0x45,
    0x78,
    0x69,
    0x66,
    0xff,
    0xdb,
    0x00,
    0x04,
    0x00,
    0x00,
    0xff,
    0xda,
    0x00,
    0x02,
    0xff,
    0xd9,
  ]);
  const result = deterministicScan(bytes, 'image/jpeg', 'jpg');
  assert(result.detectedMimeType === 'image/jpeg', 'JPEG must be detected');
  assert(result.sanitized, 'JPEG must be marked sanitized');
  assert(!new TextDecoder('latin1').decode(result.bytes).includes('Exif'), 'EXIF must be removed');
});

Deno.test('PDF scanner rejects active JavaScript content', () => {
  const bytes = new TextEncoder().encode('%PDF-1.7\n/JavaScript 1 0 R\n%%EOF');
  let observed = '';
  try {
    deterministicScan(bytes, 'application/pdf', 'pdf');
  } catch (error) {
    observed = error instanceof UploadScanError ? error.message : 'unexpected';
  }
  assert(observed === 'active_pdf_content', 'active PDF content must be rejected');
});
