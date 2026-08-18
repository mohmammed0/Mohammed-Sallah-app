import { assertEquals, assertRejects, assertThrows } from 'jsr:@std/assert@1';
import {
  assertOwnedStoragePath,
  classifyPrivacyError,
  drainOwnedStorage,
  exportStoragePath,
  privacyRetentionSchema,
  PrivacyWorkerError,
  quarantineCleanupSchema,
} from './privacy.ts';
import { workerSecretMatches } from './worker-auth.ts';

Deno.test('worker secret comparison fails closed and accepts the configured secret', async () => {
  const configured = 'privacy-worker-secret-at-least-24-characters';
  assertEquals(await workerSecretMatches(configured, configured), true);
  assertEquals(await workerSecretMatches('wrong', configured), false);
  assertEquals(await workerSecretMatches(null, configured), false);
  assertEquals(await workerSecretMatches(configured, undefined), false);
});

Deno.test('owned storage deletion drains more than 5000 objects in batches of at most 100', async () => {
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

Deno.test('owned storage deletion fails closed on a partial batch failure and can be retried', async () => {
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
  const retried = await drainOwnedStorage(
    userId,
    () => Promise.resolve([...remaining.values()]),
    (_bucket, paths) => {
      for (const path of paths) remaining.delete(path);
      return Promise.resolve();
    },
  );
  assertEquals(retried, 30);
  assertEquals(remaining.size, 0);
});

Deno.test('owned storage deletion is idempotent when no objects remain', async () => {
  const removed = await drainOwnedStorage(
    '11111111-1111-4111-8111-111111111111',
    () => Promise.resolve([]),
    () => Promise.reject(new Error('remove must not be called')),
  );
  assertEquals(removed, 0);
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
  assertThrows(() => privacyRetentionSchema.parse({ ...config, maxWorkerAttempts: 21 }));
});

Deno.test('quarantine cleanup contract is owner scoped and private', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const cleanup = quarantineCleanupSchema.parse({
    uploadId: '22222222-2222-4222-8222-222222222222',
    userId,
    bucket: 'quarantine',
    path: `${userId}/22222222-2222-4222-8222-222222222222/file.png`,
  });
  assertOwnedStoragePath(cleanup.userId, cleanup.path);
  assertThrows(
    () => quarantineCleanupSchema.parse({ ...cleanup, bucket: 'public-assets' }),
  );
});

Deno.test('export paths are owner scoped', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  const requestId = '22222222-2222-4222-8222-222222222222';
  const path = exportStoragePath(userId, requestId);
  assertEquals(path, `${userId}/${requestId}/sallah-data-export-v1.json`);
  assertOwnedStoragePath(userId, path);
});

Deno.test('cross-user and traversal paths are rejected', () => {
  const userId = '11111111-1111-4111-8111-111111111111';
  assertThrows(
    () => assertOwnedStoragePath(userId, '22222222-2222-4222-8222-222222222222/export.json'),
    PrivacyWorkerError,
    'invalid_storage_path',
  );
  assertThrows(
    () => assertOwnedStoragePath(userId, `${userId}/../export.json`),
    PrivacyWorkerError,
    'invalid_storage_path',
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
