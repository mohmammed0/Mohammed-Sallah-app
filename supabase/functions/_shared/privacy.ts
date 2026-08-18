import { z } from 'npm:zod@4.4.3';

export const privacyJobSchema = z.object({
  jobId: z.uuid(),
  jobType: z.enum(['account_deletion', 'data_export']),
  requestId: z.uuid(),
  userId: z.uuid(),
  attempt: z.number().int().positive().max(20),
});

export const privacyRetentionSchema = z.object({
  policyVersion: z.string().min(1).max(120),
  legalYears: z.number().int().min(1).max(30),
  financialYears: z.number().int().min(1).max(30),
  exportLinkSeconds: z.number().int().min(300).max(86_400),
  maxWorkerAttempts: z.number().int().min(1).max(20),
});

export const expiredExportSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  private_storage_path: z.string().min(1).max(1024),
});

export const storageObjectSchema = z.object({
  bucket_id: z.string().min(1).max(120),
  name: z.string().min(1).max(1024),
});

export const quarantineCleanupSchema = z.object({
  uploadId: z.uuid(),
  userId: z.uuid(),
  bucket: z.literal('quarantine'),
  path: z.string().min(1).max(1024),
});

export type PrivacyJob = z.infer<typeof privacyJobSchema>;
export type PrivacyRetention = z.infer<typeof privacyRetentionSchema>;
export type StorageObject = z.infer<typeof storageObjectSchema>;

export class PrivacyWorkerError extends Error {
  constructor(readonly category: string) {
    super(category);
  }
}

export function exportStoragePath(userId: string, requestId: string): string {
  z.uuid().parse(userId);
  z.uuid().parse(requestId);
  return `${userId}/${requestId}/sallah-data-export-v1.json`;
}

export function assertOwnedStoragePath(userId: string, path: string): void {
  z.uuid().parse(userId);
  if (!path.startsWith(`${userId}/`) || path.includes('..')) {
    throw new PrivacyWorkerError('invalid_storage_path');
  }
}

export function classifyPrivacyError(error: unknown): string {
  if (error instanceof PrivacyWorkerError) return error.category;
  if (
    error instanceof Error &&
    /^[a-z0-9_]{3,80}$/.test(error.message)
  ) {
    return error.message;
  }
  return 'unexpected';
}

export async function drainOwnedStorage(
  userId: string,
  queryPage: () => Promise<StorageObject[]>,
  removeBatch: (bucket: string, paths: string[]) => Promise<void>,
): Promise<number> {
  z.uuid().parse(userId);
  let removed = 0;
  for (let pass = 0; pass < 100_000; pass += 1) {
    const rows = storageObjectSchema.array().parse(await queryPage());
    if (rows.length === 0) return removed;
    const byBucket = new Map<string, string[]>();
    for (const row of rows) {
      assertOwnedStoragePath(userId, row.name);
      byBucket.set(row.bucket_id, [...(byBucket.get(row.bucket_id) ?? []), row.name]);
    }
    for (const [bucket, paths] of byBucket) {
      for (let offset = 0; offset < paths.length; offset += 100) {
        const batch = paths.slice(offset, offset + 100);
        await removeBatch(bucket, batch);
        removed += batch.length;
      }
    }
  }
  throw new PrivacyWorkerError('storage_delete_iteration_limit');
}
