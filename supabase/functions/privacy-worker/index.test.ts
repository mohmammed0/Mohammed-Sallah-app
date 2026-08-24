import { assertEquals, assertRejects } from 'jsr:@std/assert@1';
import { sha256Hex } from '../_shared/scanner-control.ts';
import {
  cleanMediaScanArtifacts,
  cleanupExpiredScannerNonces,
  type MediaArtifactCleanupClient,
} from './index.ts';

const workerId = 'privacy-worker-11111111-1111-4111-8111-111111111111';
const firstArtifactId = '11111111-1111-4111-8111-111111111111';
const secondArtifactId = '22222222-2222-4222-8222-222222222222';
const firstPath = 'aa/bb/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const secondPath = 'cc/dd/cccccccc-cccc-4ccc-8ccc-cccccccccccc';

function claim(artifactId: string, path: string) {
  return {
    artifactId,
    kind: 'scan_output',
    bucket: 'scan-output',
    path,
    leaseExpiresAt: '2026-08-21T12:05:00.000Z',
  };
}

class FakeCleanupClient implements MediaArtifactCleanupClient {
  readonly rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  readonly removeCalls: Array<{ bucket: string; paths: string[] }> = [];
  readonly claims: unknown[];
  removalFails = false;
  removalFailurePaths = new Set<string>();
  completionFails = false;

  constructor(claims: unknown[]) {
    this.claims = [...claims];
  }

  rpc(name: string, args: Record<string, unknown>) {
    this.rpcCalls.push({ name, args });
    if (name === 'claim_media_scan_artifact_cleanup') {
      return Promise.resolve({ data: this.claims.shift() ?? null, error: null });
    }
    if (name === 'complete_media_scan_artifact_cleanup') {
      return Promise.resolve({
        data: null,
        error: this.completionFails ? { message: 'lost' } : null,
      });
    }
    if (name === 'fail_media_scan_artifact_cleanup') {
      return Promise.resolve({ data: null, error: null });
    }
    if (name === 'cleanup_expired_media_scanner_nonces') {
      return Promise.resolve({
        data: {
          deleted: 3,
          requestNoncesDeleted: 2,
          attestationNoncesDeleted: 1,
        },
        error: null,
      });
    }
    throw new Error(`unexpected rpc ${name}`);
  }

  storage = {
    from: (bucket: string) => ({
      remove: (paths: string[]) => {
        this.removeCalls.push({ bucket, paths: [...paths] });
        return Promise.resolve({
          error: this.removalFails || paths.some((path) => this.removalFailurePaths.has(path))
            ? { message: 'private' }
            : null,
        });
      },
    }),
  };
}

Deno.test('privacy worker claims and deletes one opaque media artifact at a time', async () => {
  const fake = new FakeCleanupClient([
    claim(firstArtifactId, firstPath),
    claim(secondArtifactId, secondPath),
    null,
  ]);
  const result = await cleanMediaScanArtifacts(fake, workerId);
  assertEquals(result, { cleaned: 2, failed: 0 });
  assertEquals(fake.removeCalls, [
    { bucket: 'scan-output', paths: [firstPath] },
    { bucket: 'scan-output', paths: [secondPath] },
  ]);
  const completions = fake.rpcCalls.filter((call) =>
    call.name === 'complete_media_scan_artifact_cleanup'
  );
  const claims = fake.rpcCalls.filter((call) => call.name === 'claim_media_scan_artifact_cleanup');
  assertEquals(completions.length, 2);
  assertEquals(
    claims[0]?.args.p_cleanup_token_hash,
    await sha256Hex(String(completions[0]?.args.p_cleanup_token)),
  );
  assertEquals(
    new Set([
      claims[0]?.args.p_operation_id,
      completions[0]?.args.p_operation_id,
    ]).size,
    2,
  );
  assertEquals(
    /^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(String(completions[0]?.args.p_cleanup_token)),
    true,
  );
});

Deno.test('privacy worker reports exact attempt-artifact deletion failure without acknowledging it', async () => {
  const fake = new FakeCleanupClient([claim(firstArtifactId, firstPath), null]);
  fake.removalFails = true;
  const result = await cleanMediaScanArtifacts(fake, workerId);
  assertEquals(result, { cleaned: 0, failed: 1 });
  assertEquals(
    fake.rpcCalls.some((call) => call.name === 'fail_media_scan_artifact_cleanup'),
    true,
  );
  assertEquals(
    fake.rpcCalls.some((call) => call.name === 'complete_media_scan_artifact_cleanup'),
    false,
  );
});

Deno.test('one failing artifact cannot block a later eligible cleanup item', async () => {
  const fake = new FakeCleanupClient([
    claim(firstArtifactId, firstPath),
    claim(secondArtifactId, secondPath),
    null,
  ]);
  fake.removalFailurePaths.add(firstPath);

  assertEquals(await cleanMediaScanArtifacts(fake, workerId), { cleaned: 1, failed: 1 });
  assertEquals(fake.removeCalls, [
    { bucket: 'scan-output', paths: [firstPath] },
    { bucket: 'scan-output', paths: [secondPath] },
  ]);
});

Deno.test('privacy worker removes expired request and attestation nonce ledger rows', async () => {
  const fake = new FakeCleanupClient([]);
  assertEquals(await cleanupExpiredScannerNonces(fake), {
    deleted: 3,
    requestNoncesDeleted: 2,
    attestationNoncesDeleted: 1,
  });
  assertEquals(
    fake.rpcCalls.filter((call) => call.name === 'cleanup_expired_media_scanner_nonces').length,
    1,
  );
});

Deno.test('privacy worker preserves response-loss authority in DB and does not claim another artifact', async () => {
  const fake = new FakeCleanupClient([
    claim(firstArtifactId, firstPath),
    claim(secondArtifactId, secondPath),
  ]);
  fake.completionFails = true;
  await assertRejects(() => cleanMediaScanArtifacts(fake, workerId));
  assertEquals(fake.removeCalls, [{ bucket: 'scan-output', paths: [firstPath] }]);
  assertEquals(
    fake.rpcCalls.filter((call) => call.name === 'claim_media_scan_artifact_cleanup').length,
    1,
  );
});

Deno.test('privacy worker rejects malformed or retained projections before Storage deletion', async () => {
  for (
    const invalid of [
      { ...claim(firstArtifactId, firstPath), kind: 'retained' },
      { ...claim(firstArtifactId, firstPath), bucket: 'public-assets' },
      { ...claim(firstArtifactId, firstPath), path: '../private' },
      { ...claim(firstArtifactId, firstPath), extra: true },
    ]
  ) {
    const fake = new FakeCleanupClient([invalid]);
    await assertRejects(() => cleanMediaScanArtifacts(fake, workerId));
    assertEquals(fake.removeCalls, []);
  }
});
