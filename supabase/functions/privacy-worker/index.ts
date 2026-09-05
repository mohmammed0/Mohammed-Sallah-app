import { serviceClient } from '../_shared/auth.ts';
import {
  assertOwnedStoragePath,
  classifyPrivacyError,
  drainOwnedStorage,
  expiredExportSchema,
  exportStoragePath,
  mediaArtifactCleanupSchema,
  type PrivacyJob,
  privacyJobSchema,
  privacyRetentionSchema,
  PrivacyWorkerError,
  scannerNonceCleanupSchema,
} from '../_shared/privacy.ts';
import { sha256Hex } from '../_shared/scanner-control.ts';
import { workerSecretMatches } from '../_shared/worker-auth.ts';

const exportBucket = 'exports';
const maxJobsPerInvocation = 10;
const maxMediaArtifactCleanupsPerInvocation = 50;
const maxOwnedStoragePage = 1_000;
const maxOwnedStorageDirectories = 10_000;

function fail(category: string): never {
  throw new PrivacyWorkerError(category);
}

interface OwnedStorageClient {
  storage: {
    listBuckets(): Promise<{
      data: Array<{ id: string }> | null;
      error: unknown;
    }>;
    from(bucket: string): {
      list(
        prefix: string,
        options: {
          limit: number;
          offset: number;
          sortBy: { column: 'name'; order: 'asc' };
        },
      ): Promise<{
        data: Array<{ name: string; id: string | null; metadata: unknown }> | null;
        error: unknown;
      }>;
      remove(paths: string[]): Promise<{ error: unknown }>;
    };
  };
}

function validStorageSegment(value: unknown): value is string {
  return typeof value === 'string' && value.length >= 1 && value.length <= 255 &&
    value !== '.' && value !== '..' && !value.includes('/') && !value.includes('\\');
}

async function listOwnedStoragePage(
  db: OwnedStorageClient,
  userId: string,
  maximum = maxOwnedStoragePage,
) {
  const { data: buckets, error: bucketError } = await db.storage.listBuckets();
  if (bucketError || !Array.isArray(buckets) || buckets.length > 100) fail('storage_query_failed');
  const objects: Array<{ bucket_id: string; name: string }> = [];
  for (const bucket of buckets) {
    if (!validStorageSegment(bucket.id)) fail('storage_query_failed');
    const directories = [userId];
    const visited = new Set<string>();
    for (let directoryIndex = 0; directoryIndex < directories.length; directoryIndex += 1) {
      if (directories.length > maxOwnedStorageDirectories) fail('storage_query_failed');
      const directory = directories[directoryIndex];
      if (!directory || visited.has(directory)) continue;
      visited.add(directory);
      for (let offset = 0; offset < 100_000; offset += maxOwnedStoragePage) {
        const { data, error } = await db.storage.from(bucket.id).list(directory, {
          limit: maxOwnedStoragePage,
          offset,
          sortBy: { column: 'name', order: 'asc' },
        });
        if (error || !Array.isArray(data)) fail('storage_query_failed');
        for (const item of data) {
          if (!validStorageSegment(item.name)) fail('storage_query_failed');
          const path = `${directory}/${item.name}`;
          assertOwnedStoragePath(userId, path);
          if (item.id === null && item.metadata === null) {
            directories.push(path);
          } else {
            objects.push({ bucket_id: bucket.id, name: path });
            if (objects.length >= maximum) return objects;
          }
        }
        if (data.length < maxOwnedStoragePage) break;
      }
    }
  }
  return objects;
}

export async function removeOwnedStorageObjects(
  db: OwnedStorageClient,
  userId: string,
): Promise<number> {
  const removed = await drainOwnedStorage(
    userId,
    () => listOwnedStoragePage(db, userId),
    async (bucket, batch) => {
      const { error: removeError } = await db.storage.from(bucket).remove(batch);
      if (removeError) fail('storage_delete_failed');
    },
  );
  if ((await listOwnedStoragePage(db, userId, 1)).length !== 0) {
    fail('storage_objects_remaining');
  }
  return removed;
}

async function processAccountDeletion(
  db: ReturnType<typeof serviceClient>,
  job: PrivacyJob,
): Promise<void> {
  await removeOwnedStorageObjects(db, job.userId);
  const { data: authUser, error: lookupError } = await db.auth.admin.getUserById(job.userId);
  if (lookupError && lookupError.status !== 404) fail('auth_lookup_failed');
  if (authUser?.user) {
    const { error: deleteError } = await db.auth.admin.deleteUser(job.userId, true);
    if (deleteError) fail('auth_delete_failed');
  }
  const { error: completionError } = await db.rpc('complete_account_deletion', {
    p_job_id: job.jobId,
    p_request_id: job.requestId,
  });
  if (completionError) fail('deletion_completion_failed');
}

async function processDataExport(
  db: ReturnType<typeof serviceClient>,
  job: PrivacyJob,
  exportLinkSeconds: number,
): Promise<void> {
  const { data: payload, error: buildError } = await db.rpc('build_data_export', {
    p_request_id: job.requestId,
    p_user_id: job.userId,
  });
  if (buildError || !payload) fail('export_build_failed');
  const path = exportStoragePath(job.userId, job.requestId);
  const bytes = new TextEncoder().encode(JSON.stringify(payload));
  const { error: uploadError } = await db.storage.from(exportBucket).upload(path, bytes, {
    contentType: 'application/json',
    cacheControl: '0',
    upsert: true,
  });
  if (uploadError) fail('export_upload_failed');
  const { data: signed, error: signError } = await db.storage
    .from(exportBucket)
    .createSignedUrl(path, exportLinkSeconds, { download: 'sallah-data-export.json' });
  if (signError || !signed?.signedUrl) fail('export_sign_failed');
  const expiresAt = new Date(Date.now() + exportLinkSeconds * 1000).toISOString();
  const { error: completionError } = await db.rpc('complete_data_export', {
    p_job_id: job.jobId,
    p_request_id: job.requestId,
    p_private_storage_path: path,
    p_signed_download_url: signed.signedUrl,
    p_expires_at: expiresAt,
  });
  if (completionError) fail('export_completion_failed');
}

async function cleanExpiredExports(db: ReturnType<typeof serviceClient>): Promise<number> {
  const { data, error } = await db
    .from('data_export_requests')
    .select('id,user_id,private_storage_path')
    .eq('status', 'completed')
    .lte('expires_at', new Date().toISOString())
    .not('private_storage_path', 'is', null)
    .limit(50);
  if (error) fail('export_cleanup_query_failed');
  const rows = expiredExportSchema.array().parse(data ?? []);
  for (const row of rows) {
    assertOwnedStoragePath(row.user_id, row.private_storage_path);
    const { error: removeError } = await db.storage
      .from(exportBucket)
      .remove([row.private_storage_path]);
    if (removeError) fail('export_cleanup_delete_failed');
    const { error: expireError } = await db.rpc('expire_data_export', {
      p_request_id: row.id,
    });
    if (expireError) fail('export_cleanup_completion_failed');
  }
  return rows.length;
}

export interface MediaArtifactCleanupClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: unknown }>;
  storage: {
    from(bucket: string): {
      remove(paths: string[]): Promise<{ error: unknown }>;
    };
  };
}

export async function cleanMediaScanArtifacts(
  db: MediaArtifactCleanupClient,
  workerId: string,
): Promise<{ cleaned: number; failed: number }> {
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/.test(workerId)) {
    fail('invalid_cleanup_worker_id');
  }
  let cleaned = 0;
  let failed = 0;
  for (let index = 0; index < maxMediaArtifactCleanupsPerInvocation; index += 1) {
    const cleanupToken = crypto.randomUUID();
    const { data, error } = await db.rpc('claim_media_scan_artifact_cleanup', {
      p_worker_id: workerId,
      p_operation_id: crypto.randomUUID(),
      p_cleanup_token_hash: await sha256Hex(cleanupToken),
    });
    if (error) fail('media_artifact_cleanup_claim_failed');
    if (!data) break;
    const item = mediaArtifactCleanupSchema.parse(data);
    let removalFailed = false;
    try {
      const { error: removeError } = await db.storage.from(item.bucket).remove([item.path]);
      if (removeError) {
        removalFailed = true;
      }
    } catch {
      removalFailed = true;
    }
    if (removalFailed) {
      const { error: failureError } = await db.rpc('fail_media_scan_artifact_cleanup', {
        p_artifact_id: item.artifactId,
        p_cleanup_token: cleanupToken,
        p_worker_id: workerId,
        p_operation_id: crypto.randomUUID(),
        p_failure_category: 'storage_delete_failed',
      });
      if (failureError) fail('media_artifact_cleanup_failure_report_failed');
      failed += 1;
      continue;
    }
    const { error: completionError } = await db.rpc('complete_media_scan_artifact_cleanup', {
      p_artifact_id: item.artifactId,
      p_cleanup_token: cleanupToken,
      p_worker_id: workerId,
      p_operation_id: crypto.randomUUID(),
    });
    if (completionError) fail('media_artifact_cleanup_completion_failed');
    cleaned += 1;
  }
  return { cleaned, failed };
}

export async function cleanupExpiredScannerNonces(
  db: Pick<MediaArtifactCleanupClient, 'rpc'>,
) {
  const { data, error } = await db.rpc('cleanup_expired_media_scanner_nonces', {
    p_operation_id: crypto.randomUUID(),
  });
  if (error) fail('scanner_nonce_cleanup_failed');
  return scannerNonceCleanupSchema.parse(data);
}

async function reportFailure(
  db: ReturnType<typeof serviceClient>,
  job: PrivacyJob,
  category: string,
): Promise<void> {
  const { error } = await db.rpc('fail_privacy_job', {
    p_job_id: job.jobId,
    p_request_id: job.requestId,
    p_error_category: category,
  });
  if (error) {
    console.error(
      JSON.stringify({ event: 'privacy_failure_report_failed', category: 'rpc_failed' }),
    );
  }
}

export const handlePrivacyWorker = async (request: Request): Promise<Response> => {
  if (request.method !== 'POST') return new Response('method_not_allowed', { status: 405 });
  const authorized = await workerSecretMatches(
    request.headers.get('x-worker-secret'),
    Deno.env.get('PRIVACY_WORKER_SECRET'),
  );
  if (!authorized) return new Response('unauthorized', { status: 401 });

  const db = serviceClient();
  const { data: retentionData, error: retentionError } = await db.rpc(
    'get_privacy_retention_config',
  );
  const retention = privacyRetentionSchema.safeParse(retentionData);
  if (retentionError || !retention.success) {
    console.error(
      JSON.stringify({ event: 'privacy_retention_config_invalid', category: 'invalid_contract' }),
    );
    return Response.json({ error: 'worker_configuration_invalid' }, { status: 500 });
  }
  const workerId = crypto.randomUUID();
  let processed = 0;
  let failed = 0;
  let cleaned = 0;
  let quarantineCleaned = 0;
  let quarantineFailed = 0;
  let scannerNoncesCleaned = 0;
  let reconciledDeletions = 0;
  try {
    const { data, error } = await db.rpc('reconcile_blocked_account_deletions', {
      p_request_id: null,
    });
    if (error) fail('deletion_reconciliation_failed');
    reconciledDeletions = Number(
      data && typeof data === 'object' && 'unblocked' in data ? data.unblocked : 0,
    );
  } catch (error) {
    console.error(JSON.stringify({
      event: 'deletion_reconciliation_failed',
      category: classifyPrivacyError(error),
    }));
  }
  try {
    cleaned = await cleanExpiredExports(db);
  } catch (error) {
    console.error(
      JSON.stringify({ event: 'privacy_cleanup_failed', category: classifyPrivacyError(error) }),
    );
  }
  try {
    const nonces = await cleanupExpiredScannerNonces(
      db as unknown as Pick<MediaArtifactCleanupClient, 'rpc'>,
    );
    scannerNoncesCleaned = nonces.deleted;
  } catch (error) {
    console.error(
      JSON.stringify({
        event: 'scanner_nonce_cleanup_failed',
        category: classifyPrivacyError(error),
      }),
    );
  }
  try {
    const quarantine = await cleanMediaScanArtifacts(
      db as unknown as MediaArtifactCleanupClient,
      workerId,
    );
    quarantineCleaned = quarantine.cleaned;
    quarantineFailed = quarantine.failed;
  } catch (error) {
    console.error(
      JSON.stringify({ event: 'quarantine_cleanup_failed', category: classifyPrivacyError(error) }),
    );
  }

  for (let index = 0; index < maxJobsPerInvocation; index += 1) {
    const { data, error: claimError } = await db.rpc('claim_privacy_job', {
      p_worker_id: workerId,
    });
    if (claimError) {
      console.error(JSON.stringify({ event: 'privacy_claim_failed', category: 'rpc_failed' }));
      break;
    }
    if (!data) break;
    const parsed = privacyJobSchema.safeParse(data);
    if (!parsed.success) {
      console.error(
        JSON.stringify({ event: 'privacy_claim_invalid', category: 'invalid_contract' }),
      );
      break;
    }
    try {
      if (parsed.data.jobType === 'account_deletion') {
        await processAccountDeletion(db, parsed.data);
      } else {
        await processDataExport(db, parsed.data, retention.data.exportLinkSeconds);
      }
      processed += 1;
    } catch (error) {
      const category = classifyPrivacyError(error);
      await reportFailure(db, parsed.data, category);
      failed += 1;
      console.error(JSON.stringify({ event: 'privacy_job_failed', category }));
    }
  }
  return Response.json({
    processed,
    failed,
    cleaned,
    quarantineCleaned,
    quarantineFailed,
    scannerNoncesCleaned,
    reconciledDeletions,
  });
};

if (import.meta.main) Deno.serve(handlePrivacyWorker);
