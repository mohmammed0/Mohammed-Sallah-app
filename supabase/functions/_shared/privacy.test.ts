import { assertEquals, assertThrows } from 'jsr:@std/assert@1';
import {
  assertOwnedStoragePath,
  classifyPrivacyError,
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
