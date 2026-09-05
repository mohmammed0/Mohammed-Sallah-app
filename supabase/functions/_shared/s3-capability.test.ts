import { assertEquals, assertNotEquals, assertRejects, assertThrows } from 'jsr:@std/assert@1';

import { remainingCapabilitySeconds, signS3PutCapability } from './s3-capability.ts';

Deno.test('capability lifetime is clipped before the finalization margin', () => {
  const now = new Date('2026-08-24T12:00:00.000Z');
  assertEquals(
    remainingCapabilitySeconds('2026-08-24T12:01:00.000Z', now, 120),
    45,
  );
  assertEquals(
    remainingCapabilitySeconds('2026-08-24T12:03:00.000Z', now, 30),
    30,
  );
  assertThrows(
    () => remainingCapabilitySeconds('2026-08-24T12:00:15.000Z', now, 120),
    Error,
    'SIGNED_CAPABILITY_EXPIRED',
  );
});

Deno.test('S3 output capability signs one exact PUT path with bounded expiry and content type', async () => {
  const signed = await signS3PutCapability({
    origin: 'https://project.supabase.co',
    bucket: 'scan-output',
    path: 'aa/bb/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    contentType: 'video/mp4',
    accessKeyId: 'scanner-edge-only-access-key',
    secretAccessKey: 'scanner-edge-only-secret-that-never-leaves-edge',
    region: 'eu-west-1',
    expiresInSeconds: 45,
    at: new Date('2026-08-24T12:00:00.000Z'),
  });
  const parsed = new URL(signed.url);
  assertEquals(parsed.origin, 'https://project.supabase.co');
  assertEquals(
    parsed.pathname,
    '/storage/v1/s3/scan-output/aa/bb/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  );
  assertEquals(parsed.searchParams.get('X-Amz-Expires'), '45');
  assertEquals(
    parsed.searchParams.get('X-Amz-SignedHeaders'),
    'content-type;host',
  );
  assertEquals(parsed.searchParams.get('X-Amz-Content-Sha256'), 'UNSIGNED-PAYLOAD');
  assertEquals(
    parsed.searchParams.get('X-Amz-Credential'),
    'scanner-edge-only-access-key/20260824/eu-west-1/s3/aws4_request',
  );
  assertEquals(parsed.search.includes('scanner-edge-only-secret'), false);
  assertEquals(signed.headers, { 'content-type': 'video/mp4' });
  assertEquals(/^[0-9a-f]{64}$/.test(parsed.searchParams.get('X-Amz-Signature') ?? ''), true);

  const otherMime = await signS3PutCapability({
    origin: 'https://project.supabase.co',
    bucket: 'scan-output',
    path: 'aa/bb/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    contentType: 'image/png',
    accessKeyId: 'scanner-edge-only-access-key',
    secretAccessKey: 'scanner-edge-only-secret-that-never-leaves-edge',
    region: 'eu-west-1',
    expiresInSeconds: 45,
    at: new Date('2026-08-24T12:00:00.000Z'),
  });
  assertNotEquals(new URL(otherMime.url).search, parsed.search);
});

Deno.test('S3 output capability rejects unsafe origins, paths, and excessive expiry', async () => {
  const base = {
    origin: 'https://project.supabase.co',
    bucket: 'scan-output' as const,
    path: 'aa/bb/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    contentType: 'image/png' as const,
    accessKeyId: 'scanner-edge-only-access-key',
    secretAccessKey: 'scanner-edge-only-secret-that-never-leaves-edge',
    region: 'eu-west-1',
    expiresInSeconds: 45,
    at: new Date('2026-08-24T12:00:00.000Z'),
  };
  for (
    const change of [
      { origin: 'https://user@project.supabase.co' },
      { path: '../other/object' },
      { path: 'aa%2fbb/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' },
      { expiresInSeconds: 121 },
    ]
  ) {
    await assertRejects(() => signS3PutCapability({ ...base, ...change }));
  }
});
