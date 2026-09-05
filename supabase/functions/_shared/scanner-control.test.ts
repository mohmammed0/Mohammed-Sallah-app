import { assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert@1';
import {
  canonicalAttestation,
  canonicalControlRequest,
  hmacHex,
  parseScannerRuntimeConfig,
  readBoundedJson,
  scannerAttestationSchema,
  sha256Hex,
  validateSignedCapability,
  verifyHmacHex,
} from './scanner-control.ts';
import golden from './scanner-control-golden.json' with { type: 'json' };

const controlSecret = 'control-secret-that-is-at-least-thirty-two-bytes';
const manifest = {
  schemaVersion: 'sallah-media-attestation-v1',
  attemptId: '22222222-2222-4222-8222-222222222222',
  inputRef: 'aa/bb/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  outputRef: 'cc/dd/cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  purpose: 'request_media',
  detectedInputMime: 'image/png',
  detectedOutputMime: 'image/png',
  inputSize: 20 * 1024 * 1024,
  outputSize: 20 * 1024 * 1024,
  inputSha256: '1'.repeat(64),
  outputSha256: '2'.repeat(64),
  originalScan: 'clean',
  finalScan: 'clean',
  sanitized: true,
  sanitizer: 'decode-reencode-png-v1',
  sanitizerVersion: '1.0.0',
  clamavEngineVersion: '1.4.3',
  signatureVersion: '28000',
  signatureTimestamp: '2026-08-21T12:00:00.000Z',
  signatureAgeSeconds: 60,
  processingDurationMs: 80_000,
  jobDeadline: '2026-08-21T12:02:00.000Z',
  nonce: '33333333-3333-4333-8333-333333333333',
  correlationId: '44444444-4444-4444-8444-444444444444',
  readbackSha256: '2'.repeat(64),
  storageFingerprint: 'a'.repeat(32),
} as const;

Deno.test('scanner runtime fails closed for missing and misspelled APP_ENV', () => {
  for (const appEnv of [undefined, '', 'prod', 'locla']) {
    assertThrows(() =>
      parseScannerRuntimeConfig({
        APP_ENV: appEnv,
        UPLOAD_SCANNER_CONTROL_SECRET: controlSecret,
        UPLOAD_SCANNER_ATTESTATION_SECRET: `${controlSecret}-attestation`,
        UPLOAD_SCANNER_STORAGE_ORIGIN: 'https://project.supabase.co',
        UPLOAD_SCANNER_CONTROL_ORIGIN: 'https://edge.example.test',
        UPLOAD_SCANNER_SIGNATURE_MAX_AGE_HOURS: '24',
      })
    );
  }
});

Deno.test('scanner runtime permits HTTP only for explicit local/test and never defaults deterministic mode', () => {
  const local = parseScannerRuntimeConfig({
    APP_ENV: 'local',
    UPLOAD_SCANNER_MODE: 'deterministic',
    UPLOAD_SCANNER_CONTROL_SECRET: controlSecret,
    UPLOAD_SCANNER_ATTESTATION_SECRET: `${controlSecret}-attestation`,
    UPLOAD_SCANNER_STORAGE_ORIGIN: 'http://127.0.0.1:54321',
    UPLOAD_SCANNER_CONTROL_ORIGIN: 'http://127.0.0.1:54321',
    UPLOAD_SCANNER_SIGNATURE_MAX_AGE_HOURS: '168',
  });
  assertEquals(local.appEnv, 'local');
  assertEquals(local.mode, 'deterministic');
  assertThrows(() =>
    parseScannerRuntimeConfig({
      APP_ENV: 'preview',
      UPLOAD_SCANNER_MODE: 'deterministic',
      UPLOAD_SCANNER_CONTROL_SECRET: controlSecret,
      UPLOAD_SCANNER_ATTESTATION_SECRET: `${controlSecret}-attestation`,
      UPLOAD_SCANNER_STORAGE_ORIGIN: 'https://project.supabase.co',
      UPLOAD_SCANNER_CONTROL_ORIGIN: 'https://edge.example.test',
      UPLOAD_SCANNER_SIGNATURE_MAX_AGE_HOURS: '24',
    })
  );
});

Deno.test('scanner runtime secrets use the shared 32-256 UTF-8 byte contract', () => {
  const byteBounded = {
    APP_ENV: 'production',
    UPLOAD_SCANNER_MODE: 'external',
    UPLOAD_SCANNER_CONTROL_SECRET: 'é'.repeat(16),
    UPLOAD_SCANNER_ATTESTATION_SECRET: 'ß'.repeat(16),
    UPLOAD_SCANNER_STORAGE_ORIGIN: 'https://project.supabase.co',
    UPLOAD_SCANNER_CONTROL_ORIGIN: 'https://edge.example.test',
    UPLOAD_SCANNER_SIGNATURE_MAX_AGE_HOURS: '24',
  };
  assertEquals(parseScannerRuntimeConfig(byteBounded).controlSecret, 'é'.repeat(16));
  assertThrows(() =>
    parseScannerRuntimeConfig({
      ...byteBounded,
      UPLOAD_SCANNER_CONTROL_SECRET: '😀'.repeat(65),
    })
  );
});

Deno.test('control canonicalization binds version method path action attempt timestamp nonce and body', async () => {
  const bodyHash = await sha256Hex('{}');
  assertEquals(
    canonicalControlRequest({
      method: 'POST',
      path: '/functions/v1/scanner-control',
      workerId: 'scanner-worker-1',
      action: 'claim',
      attemptId: '-',
      timestamp: 1_787_337_600,
      nonce: '11111111-1111-4111-8111-111111111111',
      bodySha256: bodyHash,
    }),
    [
      'sallah-scanner-control-v1',
      'scanner-worker-1',
      'POST',
      '/functions/v1/scanner-control',
      'claim',
      '-',
      '1787337600',
      '11111111-1111-4111-8111-111111111111',
      bodyHash,
    ].join('\n'),
  );
});

Deno.test('HMAC verification is exact and rejects modified action, attempt, or body', async () => {
  const canonical = canonicalControlRequest({
    method: 'POST',
    path: '/functions/v1/scanner-control',
    workerId: 'scanner-worker-1',
    action: 'complete',
    attemptId: '22222222-2222-4222-8222-222222222222',
    timestamp: 1_787_337_600,
    nonce: '11111111-1111-4111-8111-111111111111',
    bodySha256: await sha256Hex('{}'),
  });
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(controlSecret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = [
    ...new Uint8Array(await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(canonical))),
  ]
    .map((value) => value.toString(16).padStart(2, '0')).join('');
  assertEquals(await verifyHmacHex(controlSecret, canonical, signature), true);
  assertEquals(
    await verifyHmacHex(controlSecret, canonical.replace('complete', 'fail'), signature),
    false,
  );
  assertEquals(await verifyHmacHex(controlSecret, canonical, `${signature.slice(0, -2)}00`), false);
});

Deno.test('bounded JSON rejects oversized metadata before parsing', async () => {
  const oversized = new Request('https://edge.example.test/functions/v1/scanner-control', {
    method: 'POST',
    body: JSON.stringify({ padding: 'x'.repeat(65_536) }),
  });
  await assertRejects(() => readBoundedJson(oversized, 65_536), Error, 'SCANNER_REQUEST_TOO_LARGE');
});

Deno.test('bounded JSON stops streaming before an untrusted body can grow past the cap', async () => {
  let pulls = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      pulls += 1;
      controller.enqueue(new TextEncoder().encode('123456'));
      if (pulls === 3) controller.close();
    },
  });
  const oversized = new Request('https://edge.example.test/functions/v1/scanner-control', {
    method: 'POST',
    body,
  });
  await assertRejects(() => readBoundedJson(oversized, 8), Error, 'SCANNER_REQUEST_TOO_LARGE');
  assertEquals(pulls, 2);
});

Deno.test('signed capability validation rejects redirects, userinfo, wrong origin, and non-HTTPS beta URLs', () => {
  const expected = 'https://project.supabase.co';
  assertEquals(
    validateSignedCapability(
      'https://project.supabase.co/storage/v1/object/sign/scan-input/aa/bb/object?token=one',
      expected,
      'preview',
      '/storage/v1/object/sign/scan-input/aa/bb/object',
    ).origin,
    expected,
  );
  for (
    const value of [
      'http://project.supabase.co/storage/v1/object/sign/scan-input/aa/bb/object?token=one',
      'https://user@project.supabase.co/storage/v1/object/sign/scan-input/aa/bb/object?token=one',
      'https://evil.example/storage/v1/object/sign/scan-input/aa/bb/object?token=one',
      'https://project.supabase.co:444/storage/v1/object/sign/scan-input/aa/bb/object?token=one',
    ]
  ) {
    assertThrows(() =>
      validateSignedCapability(
        value,
        expected,
        'preview',
        '/storage/v1/object/sign/scan-input/aa/bb/object',
      )
    );
  }
});

Deno.test('attestation canonicalization is fixed-key strict and rejects unexpected metadata', () => {
  const parsed = scannerAttestationSchema.parse(manifest);
  const canonical = canonicalAttestation(parsed);
  assertEquals(canonical, JSON.stringify(parsed));
  assertThrows(() => scannerAttestationSchema.parse({ ...manifest, privateScannerJson: {} }));
});

Deno.test('Deno canonicalization matches the shared Node/Deno golden vectors', async () => {
  assertEquals(await sha256Hex(golden.control.body), golden.control.bodySha256);
  assertEquals(
    await hmacHex(golden.control.secret, golden.control.canonical),
    golden.control.signature,
  );
  const parsed = scannerAttestationSchema.parse(golden.attestation.manifest);
  assertEquals(canonicalAttestation(parsed), golden.attestation.canonical);
  assertEquals(await sha256Hex(golden.attestation.canonical), golden.attestation.fingerprint);
  assertEquals(
    await hmacHex(golden.attestation.secret, golden.attestation.canonical),
    golden.attestation.signature,
  );
});
