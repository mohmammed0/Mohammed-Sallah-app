import { serviceClient } from '../_shared/auth.ts';
import {
  assertOwnedStoragePath,
  classifyPrivacyError,
  expiredExportSchema,
  exportStoragePath,
  type PrivacyJob,
  privacyJobSchema,
  privacyRetentionSchema,
  PrivacyWorkerError,
  quarantineCleanupSchema,
  storageObjectSchema,
} from '../_shared/privacy.ts';
import { workerSecretMatches } from '../_shared/worker-auth.ts';

const exportBucket = 'exports';
const maxJobsPerInvocation = 10;
const maxQuarantineCleanupsPerInvocation = 50;

function fail(category: string): never {
  throw new PrivacyWorkerError(category);
}

async function removeStorageObjects(
  db: ReturnType<typeof serviceClient>,
  userId: string,
): Promise<number> {
  const { data, error } = await db
    .schema('storage')
    .from('objects')
    .select('bucket_id,name')
    .like('name', `${userId}/%`)
    .limit(5000);
  if (error) fail('storage_query_failed');
  const rows = storageObjectSchema.array().parse(data ?? []);
  const byBucket = new Map<string, string[]>();
  for (const row of rows) {
    assertOwnedStoragePath(userId, row.name);
    byBucket.set(row.bucket_id, [...(byBucket.get(row.bucket_id) ?? []), row.name]);
  }
  for (const [bucket, paths] of byBucket) {
    for (let offset = 0; offset < paths.length; offset += 100) {
      const batch = paths.slice(offset, offset + 100);
      const { error: removeError } = await db.storage.from(bucket).remove(batch);
      if (removeError) fail('storage_delete_failed');
    }
  }
  return rows.length;
}

async function processAccountDeletion(
  db: ReturnType<typeof serviceClient>,
  job: PrivacyJob,
): Promise<void> {
  await removeStorageObjects(db, job.userId);
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

async function cleanQuarantinedUploads(
  db: ReturnType<typeof serviceClient>,
  workerId: string,
): Promise<{ cleaned: number; failed: number }> {
  let cleaned = 0;
  let failed = 0;
  for (let index = 0; index < maxQuarantineCleanupsPerInvocation; index += 1) {
    const { data, error } = await db.rpc('claim_upload_quarantine_cleanup', {
      p_worker_id: workerId,
    });
    if (error) fail('quarantine_cleanup_claim_failed');
    if (!data) break;
    const item = quarantineCleanupSchema.parse(data);
    assertOwnedStoragePath(item.userId, item.path);
    const { error: removeError } = await db.storage.from(item.bucket).remove([item.path]);
    if (removeError) {
      await db.rpc('fail_upload_quarantine_cleanup', {
        p_upload_id: item.uploadId,
        p_worker_id: workerId,
        p_error_category: 'quarantine_delete_failed',
      });
      failed += 1;
      continue;
    }
    const { error: completionError } = await db.rpc('complete_upload_quarantine_cleanup', {
      p_upload_id: item.uploadId,
      p_worker_id: workerId,
    });
    if (completionError) fail('quarantine_cleanup_completion_failed');
    cleaned += 1;
  }
  return { cleaned, failed };
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

Deno.serve(async (request) => {
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
  try {
    cleaned = await cleanExpiredExports(db);
  } catch (error) {
    console.error(
      JSON.stringify({ event: 'privacy_cleanup_failed', category: classifyPrivacyError(error) }),
    );
  }
  try {
    const quarantine = await cleanQuarantinedUploads(db, workerId);
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
  return Response.json({ processed, failed, cleaned, quarantineCleaned, quarantineFailed });
});
