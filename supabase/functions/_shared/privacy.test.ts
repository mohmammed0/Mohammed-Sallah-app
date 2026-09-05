import { assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert@1';
import {
  assertOwnedStoragePath,
  classifyPrivacyError,
  drainOwnedStorage,
  exportStoragePath,
  mediaArtifactCleanupSchema,
  privacyRetentionSchema,
  PrivacyWorkerError,
} from './privacy.ts';
import { workerSecretMatches } from './worker-auth.ts';

Deno.test('worker secret comparison fails closed and accepts the configured secret', async () => {
  const configured = 'privacy-worker-secret-at-least-24-characters';
  assertEquals(await workerSecretMatches(configured, configured), true);
  assertEquals(await workerSecretMatches('wrong', configured), false);
  assertEquals(await workerSecretMatches(null, configured), false);
  assertEquals(await workerSecretMatches(configured, undefined), false);
});

Deno.test('owned storage deletion drains more than 5000 objects in bounded batches', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const remaining = new Map(
    Array.from({ length: 5_237 }, (_, index) => {
      const path = `${userId}/private/file-${String(index).padStart(5, '0')}.bin`;
      return [path, { bucket_id: index % 2 === 0 ? 'proofs' : 'messages', name: path }] as const;
    }),
  );
  let largestBatch = 0;
  const removed = await drainOwnedStorage(
    userId,
    () => Promise.resolve([...remaining.values()].slice(0, 1000)),
    (_bucket, paths) => {
      largestBatch = Math.max(largestBatch, paths.length);
      for (const path of paths) remaining.delete(path);
      return Promise.resolve();
    },
  );
  assertEquals(removed, 5_237);
  assertEquals(remaining.size, 0);
  assertEquals(largestBatch <= 100, true);
});

Deno.test('owned storage deletion fails closed on partial failure and can be retried', async () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const remaining = new Map(
    Array.from({ length: 130 }, (_, index) => {
      const path = `${userId}/private/retry-${index}.bin`;
      return [path, { bucket_id: 'proofs', name: path }] as const;
    }),
  );
  let calls = 0;
  await assertRejects(
    () =>
      drainOwnedStorage(
        userId,
        () => Promise.resolve([...remaining.values()]),
        (_bucket, paths) => {
          calls += 1;
          if (calls === 2) throw new PrivacyWorkerError('storage_delete_failed');
          for (const path of paths) remaining.delete(path);
          return Promise.resolve();
        },
      ),
    PrivacyWorkerError,
    'storage_delete_failed',
  );
  assertEquals(remaining.size, 30);
  assertEquals(
    await drainOwnedStorage(
      userId,
      () => Promise.resolve([...remaining.values()]),
      (_bucket, paths) => {
        for (const path of paths) remaining.delete(path);
        return Promise.resolve();
      },
    ),
    30,
  );
});

Deno.test('privacy retention contract is bounded and explicit', () => {
  const config = privacyRetentionSchema.parse({
    policyVersion: 'sa-conservative-v1',
    legalYears: 10,
    financialYears: 10,
    exportLinkSeconds: 3600,
    maxWorkerAttempts: 5,
  });
  assertEquals(config.exportLinkSeconds, 3600);
  assertThrows(() => privacyRetentionSchema.parse({ ...config, exportLinkSeconds: 0 }));
});

Deno.test('media artifact cleanup accepts exact attempt paths and never retained kind', () => {
  const parsed = mediaArtifactCleanupSchema.parse({
    artifactId: '11111111-1111-4111-8111-111111111111',
    kind: 'scan_input',
    bucket: 'scan-input',
    path: 'aa/bb/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    leaseExpiresAt: '2026-08-21T12:05:00.000Z',
  });
  assertEquals(parsed.kind, 'scan_input');
  for (
    const invalid of [
      { ...parsed, kind: 'retained' },
      { ...parsed, bucket: 'scan-output' },
      { ...parsed, path: '../private' },
      { ...parsed, extra: true },
    ]
  ) assertThrows(() => mediaArtifactCleanupSchema.parse(invalid));
});

Deno.test('media artifact cleanup binds final candidates to private clean buckets and opaque paths', () => {
  const base = {
    artifactId: '11111111-1111-4111-8111-111111111111',
    kind: 'final_candidate',
    bucket: 'provider-documents',
    path: 'clean/aa/bb/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
    leaseExpiresAt: '2026-08-21T12:05:00.000Z',
  };
  assertEquals(mediaArtifactCleanupSchema.parse(base).bucket, 'provider-documents');
  assertThrows(() => mediaArtifactCleanupSchema.parse({ ...base, bucket: 'public-assets' }));
  assertThrows(() =>
    mediaArtifactCleanupSchema.parse({ ...base, path: 'owner/resource/file.png' })
  );
});

Deno.test('export and owned paths are owner-scoped', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const requestId = '22222222-2222-4222-8222-222222222222';
  const path = exportStoragePath(userId, requestId);
  assertEquals(path, `${userId}/${requestId}/sallah-data-export-v1.json`);
  assertOwnedStoragePath(userId, path);
  assertThrows(
    () => assertOwnedStoragePath(userId, `${userId}/../export.json`),
    PrivacyWorkerError,
  );
});

Deno.test('errors are reduced to safe categories', () => {
  assertEquals(
    classifyPrivacyError(new PrivacyWorkerError('export_upload_failed')),
    'export_upload_failed',
  );
  assertEquals(classifyPrivacyError(new Error('UNSAFE detail')), 'unexpected');
  assertEquals(classifyPrivacyError('unknown'), 'unexpected');
});
