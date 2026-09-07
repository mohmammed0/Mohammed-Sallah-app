import { createRandomId } from './random-id';
import { z } from 'zod';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { chunkedSecureStorage } from './secure-storage';
import { supabase } from './supabase';

const unboundPurposeSchema = z.enum(['request_media', 'request_audio', 'provider_document']);
const resourcePurposeSchema = z.enum([
  'completion_proof',
  'support_evidence',
  'message_attachment',
]);
const mediaPurposeSchema = z.union([unboundPurposeSchema, resourcePurposeSchema]);
const mediaFingerprintSchema = z.string().regex(/^[0-9a-f]{64}$/);
const ticketSchema = z.object({
  uploadId: z.uuid(),
  bucket: z.literal('quarantine'),
  path: z.string().min(1).max(500),
  contentType: z.string().min(1).max(100),
  expiresAt: z.string(),
});
const cleanUploadSchema = z.object({
  uploadId: z.uuid(),
  status: z.literal('clean'),
  sanitized: z.literal(true),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'audio/mp4', 'video/mp4']),
  sizeBytes: z
    .number()
    .int()
    .positive()
    .max(20 * 1024 * 1024),
});
const activeScanSchema = z
  .object({
    uploadId: z.uuid(),
    status: z.enum(['queued', 'scanning']),
  })
  .passthrough();
const retryableScanSchema = z
  .object({
    uploadId: z.uuid(),
    status: z.literal('retryable_failure'),
    retryAt: z.string().nullable().optional(),
  })
  .passthrough();
const terminalScanSchema = z
  .object({
    uploadId: z.uuid(),
    status: z.enum(['rejected', 'terminal_failure']),
    terminalCategory: z.string().max(80).nullable().optional(),
  })
  .passthrough();
const scanStatusSchema = z.union([
  cleanUploadSchema,
  activeScanSchema,
  retryableScanSchema,
  terminalScanSchema,
]);
const functionResponseSchema = z.object({
  data: z.unknown(),
  error: z.unknown().nullable(),
});
const pendingUploadBaseSchema = z.object({
  uploadId: z.uuid(),
  operationId: z.uuid(),
  ownerId: z.uuid(),
  recoveryKey: z.string().min(1).max(160),
  purpose: mediaPurposeSchema,
  resourceId: z.uuid().nullable(),
  mediaFingerprint: mediaFingerprintSchema,
  createdAt: z.iso.datetime({ offset: true }),
});
const pendingUploadSchema = z.discriminatedUnion('state', [
  pendingUploadBaseSchema
    .extend({
      state: z.enum(['quarantine_pending', 'uploaded', 'started']),
    })
    .strict(),
  pendingUploadBaseSchema
    .extend({
      state: z.literal('completed'),
      result: cleanUploadSchema,
    })
    .strict(),
]);
const pendingUploadsSchema = pendingUploadSchema.array().max(256);
const pendingJournalSchema = z
  .object({
    schemaVersion: z.literal(1),
    revision: z
      .number()
      .int()
      .nonnegative()
      .max(Number.MAX_SAFE_INTEGER - 1),
    records: pendingUploadsSchema,
  })
  .strict();

const legacyPendingStorageKey = 'sallah.media.scan.pending.v1';
const pendingStorageKeys = [
  'sallah.media.scan.pending.v2.a',
  'sallah.media.scan.pending.v2.b',
] as const;
const maxPollAttempts = 20;
const maxPendingUploads = 8;
const maxJournalRecords = 256;
const completedRetentionMs = 7 * 24 * 60 * 60 * 1_000;
let journalLock: Promise<void> = Promise.resolve();

type UnboundPurpose = z.infer<typeof unboundPurposeSchema>;
type ResourcePurpose = z.infer<typeof resourcePurposeSchema>;
export type PendingSecureUpload = z.infer<typeof pendingUploadSchema>;

type SecureUploadInput = {
  bytes: Uint8Array;
  filename: string;
  mimeType: string;
  recoveryKey: string;
} & (
  { purpose: UnboundPurpose; resourceId?: never } | { purpose: ResourcePurpose; resourceId: string }
);

export type CleanUpload = z.infer<typeof cleanUploadSchema>;

type PollOptions = {
  sleep?: (milliseconds: number) => Promise<void>;
};

type ResumeOptions = PollOptions & {
  consumeClean?: boolean;
  maxAttempts?: number;
};

export type SecureUploadRecovery = {
  ambiguous: PendingSecureUpload[];
  completed: CleanUpload[];
  active: PendingSecureUpload[];
};

type PendingJournalSnapshot = {
  key: (typeof pendingStorageKeys)[number] | typeof legacyPendingStorageKey | null;
  revision: number;
  records: PendingSecureUpload[];
};

async function readJournalSnapshot(): Promise<PendingJournalSnapshot> {
  const candidates: PendingJournalSnapshot[] = [];
  let invalidSlotFound = false;
  for (const key of pendingStorageKeys) {
    const raw = await chunkedSecureStorage.getItem(key);
    if (!raw) continue;
    let parsed: ReturnType<typeof pendingJournalSchema.safeParse>;
    try {
      parsed = pendingJournalSchema.safeParse(JSON.parse(raw));
    } catch {
      invalidSlotFound = true;
      continue;
    }
    if (!parsed.success) {
      invalidSlotFound = true;
      continue;
    }
    candidates.push({ key, revision: parsed.data.revision, records: parsed.data.records });
  }
  const current = candidates.sort((left, right) => right.revision - left.revision)[0];
  if (current) return current;

  const legacyRaw = await chunkedSecureStorage.getItem(legacyPendingStorageKey);
  if (legacyRaw) {
    try {
      return {
        key: legacyPendingStorageKey,
        revision: 0,
        records: pendingUploadsSchema.parse(JSON.parse(legacyRaw)),
      };
    } catch {
      throw new Error('UPLOAD_RECOVERY_JOURNAL_INVALID');
    }
  }
  if (invalidSlotFound) throw new Error('UPLOAD_RECOVERY_JOURNAL_INVALID');
  return { key: null, revision: 0, records: [] };
}

async function readPending(): Promise<PendingSecureUpload[]> {
  return (await readJournalSnapshot()).records;
}

async function writePending(records: readonly PendingSecureUpload[]): Promise<void> {
  const current = await readJournalSnapshot();
  const targetKey =
    current.key === pendingStorageKeys[0] ? pendingStorageKeys[1] : pendingStorageKeys[0];
  const next = pendingJournalSchema.parse({
    schemaVersion: 1,
    revision: current.revision + 1,
    records,
  });
  // Write only the inactive slot. The prior valid generation remains readable if the chunked
  // storage primitive is interrupted after clearing its target but before committing every chunk.
  await chunkedSecureStorage.setItem(targetKey, JSON.stringify(next));
}

async function withJournalLock<T>(action: () => Promise<T>): Promise<T> {
  const previous = journalLock;
  let release: () => void = () => {};
  journalLock = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await action();
  } finally {
    release();
  }
}

async function replacePending(record: PendingSecureUpload): Promise<void> {
  await withJournalLock(async () => {
    const current = await readPending();
    const existingIndex = current.findIndex(
      (item) => item.ownerId === record.ownerId && item.uploadId === record.uploadId,
    );
    if (
      existingIndex < 0 &&
      current.filter((item) => item.ownerId === record.ownerId && item.state !== 'completed')
        .length >= maxPendingUploads
    ) {
      throw new Error('UPLOAD_RECOVERY_CAPACITY_EXCEEDED');
    }
    if (existingIndex < 0 && current.length >= maxJournalRecords) {
      throw new Error('UPLOAD_RECOVERY_JOURNAL_CAPACITY_EXCEEDED');
    }
    const next =
      existingIndex < 0
        ? [...current, record]
        : current.map((item, index) => (index === existingIndex ? record : item));
    await writePending(next);
  });
}

function compactCompletedForInsert(
  records: readonly PendingSecureUpload[],
  now = Date.now(),
): PendingSecureUpload[] {
  const retentionBoundary = now - completedRetentionMs;
  let compacted = records.filter(
    (record) => record.state !== 'completed' || Date.parse(record.createdAt) >= retentionBoundary,
  );
  if (compacted.length < maxJournalRecords) return compacted;

  const completedOldestFirst = compacted
    .filter((record) => record.state === 'completed')
    .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt));
  const discardCount = compacted.length - maxJournalRecords + 1;
  const discarded = new Set(
    completedOldestFirst
      .slice(0, discardCount)
      .map((record) => `${record.ownerId}:${record.uploadId}:${record.operationId}`),
  );
  compacted = compacted.filter(
    (record) => !discarded.has(`${record.ownerId}:${record.uploadId}:${record.operationId}`),
  );
  return compacted;
}

async function removePending(
  ownerId: string,
  uploadId: string,
  operationId: string,
): Promise<void> {
  await withJournalLock(async () => {
    await writePending(
      (await readPending()).filter(
        (item) =>
          item.ownerId !== ownerId ||
          item.uploadId !== uploadId ||
          item.operationId !== operationId,
      ),
    );
  });
}

export async function listPendingSecureUploads(ownerId: string): Promise<PendingSecureUpload[]> {
  const parsedOwnerId = z.uuid().parse(ownerId);
  return (await readPending()).filter((item) => item.ownerId === parsedOwnerId);
}

export async function discardCompletedSecureUploads(ownerId: string): Promise<number> {
  const parsedOwnerId = z.uuid().parse(ownerId);
  return withJournalLock(async () => {
    const current = await readPending();
    const next = current.filter(
      (item) => item.ownerId !== parsedOwnerId || item.state !== 'completed',
    );
    const discarded = current.length - next.length;
    if (discarded > 0) await writePending(next);
    return discarded;
  });
}

function delayForAttempt(attempt: number): number {
  return Math.min(500 * 2 ** attempt, 8_000);
}

async function invokeScan(record: PendingSecureUpload) {
  const body =
    record.state === 'started'
      ? { uploadId: record.uploadId, action: 'status' as const }
      : {
          uploadId: record.uploadId,
          action: 'start' as const,
          operationId: record.operationId,
        };
  const raw: unknown = await supabase.functions.invoke<unknown>('scan-upload', { body });
  const response = functionResponseSchema.parse(raw);
  if (response.error) throw new Error('UPLOAD_SCAN_PENDING');
  return scanStatusSchema.parse(response.data);
}

export async function resumeSecureUpload(
  ownerId: string,
  uploadId: string,
  options: ResumeOptions = {},
): Promise<CleanUpload> {
  const parsedOwnerId = z.uuid().parse(ownerId);
  z.uuid().parse(uploadId);
  const attemptLimit = z
    .number()
    .int()
    .min(1)
    .max(maxPollAttempts)
    .parse(options.maxAttempts ?? maxPollAttempts);
  const sleep =
    options.sleep ??
    ((milliseconds) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds)));
  let record = (await readPending()).find(
    (item) => item.ownerId === parsedOwnerId && item.uploadId === uploadId,
  );
  if (!record) throw new Error('UPLOAD_SCAN_NOT_PENDING');
  if (record.state === 'completed') {
    if (options.consumeClean !== false) {
      await removePending(record.ownerId, record.uploadId, record.operationId);
    }
    return record.result;
  }
  if (record.state === 'quarantine_pending') {
    throw new Error('QUARANTINE_UPLOAD_INCOMPLETE');
  }

  for (let attempt = 0; attempt < attemptLimit; attempt += 1) {
    let status: z.infer<typeof scanStatusSchema>;
    try {
      status = await invokeScan(record);
    } catch {
      throw new Error('UPLOAD_SCAN_PENDING');
    }
    if (status.uploadId !== record.uploadId) throw new Error('UPLOAD_SCAN_RESPONSE_INVALID');
    if (status.status === 'clean') {
      if (options.consumeClean === false) {
        await replacePending({ ...record, state: 'completed', result: status });
      } else {
        await removePending(record.ownerId, record.uploadId, record.operationId);
      }
      return status;
    }
    if (status.status === 'rejected' || status.status === 'terminal_failure') {
      await removePending(record.ownerId, record.uploadId, record.operationId);
      throw new Error(
        status.status === 'rejected' ? 'UPLOAD_REJECTED' : 'UPLOAD_SCAN_TERMINAL_FAILURE',
      );
    }
    if (record.state === 'uploaded') {
      record = { ...record, state: 'started' };
      await replacePending(record);
    }
    if (attempt + 1 < attemptLimit) await sleep(delayForAttempt(attempt));
  }
  throw new Error('UPLOAD_SCAN_PENDING');
}

export async function retryPendingSecureUpload(
  ownerId: string,
  uploadId: string,
  options: ResumeOptions = {},
): Promise<CleanUpload> {
  const parsedOwnerId = z.uuid().parse(ownerId);
  const parsedUploadId = z.uuid().parse(uploadId);
  const record = (await readPending()).find(
    (item) => item.ownerId === parsedOwnerId && item.uploadId === parsedUploadId,
  );
  if (!record) throw new Error('UPLOAD_SCAN_NOT_PENDING');
  if (record.state === 'quarantine_pending') {
    await replacePending({ ...record, state: 'uploaded' });
    try {
      return await resumeSecureUpload(parsedOwnerId, parsedUploadId, options);
    } catch (error) {
      const current = (await readPending()).find(
        (item) =>
          item.ownerId === parsedOwnerId &&
          item.uploadId === parsedUploadId &&
          item.operationId === record.operationId,
      );
      if (current?.state === 'uploaded') {
        await replacePending({ ...record, state: 'quarantine_pending' });
      }
      throw error;
    }
  }
  return resumeSecureUpload(parsedOwnerId, parsedUploadId, options);
}

export async function recoverPendingSecureUploads(
  ownerId: string,
  options: ResumeOptions = {},
): Promise<SecureUploadRecovery> {
  const parsedOwnerId = z.uuid().parse(ownerId);
  const recovered: SecureUploadRecovery = { ambiguous: [], completed: [], active: [] };
  const records = await listPendingSecureUploads(parsedOwnerId);
  for (const record of records) {
    if (record.state === 'quarantine_pending') {
      recovered.ambiguous.push(record);
      continue;
    }
    try {
      recovered.completed.push(
        await resumeSecureUpload(parsedOwnerId, record.uploadId, {
          ...options,
          consumeClean: false,
        }),
      );
    } catch (error) {
      if (
        error instanceof Error &&
        ['UPLOAD_REJECTED', 'UPLOAD_SCAN_TERMINAL_FAILURE'].includes(error.message)
      )
        continue;
      const current = (await listPendingSecureUploads(parsedOwnerId)).find(
        (item) => item.uploadId === record.uploadId,
      );
      if (current) recovered.active.push(current);
    }
  }
  return recovered;
}

async function requireCurrentOwner(): Promise<string> {
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) throw new Error('AUTH_REQUIRED');
  return z.uuid().parse(data.user.id);
}

export async function secureUpload(
  input: SecureUploadInput,
  options: PollOptions = {},
): Promise<CleanUpload> {
  if (
    !['image/jpeg', 'image/png', 'image/webp', 'audio/mp4', 'video/mp4'].includes(input.mimeType)
  ) {
    throw new Error('MEDIA_TYPE_UNAVAILABLE');
  }
  const ownerId = await requireCurrentOwner();
  const recoveryKey = z.string().min(1).max(160).parse(input.recoveryKey);
  const purpose = mediaPurposeSchema.parse(input.purpose);
  const resourceId = 'resourceId' in input ? z.uuid().parse(input.resourceId) : null;
  const mediaFingerprint = bytesToHex(sha256(input.bytes));
  const existing = (await listPendingSecureUploads(ownerId)).find(
    (item) =>
      item.recoveryKey === recoveryKey &&
      item.purpose === purpose &&
      item.resourceId === resourceId &&
      item.mediaFingerprint === mediaFingerprint,
  );
  if (existing) {
    if (existing.state === 'quarantine_pending') {
      throw new Error('UPLOAD_RECOVERY_ACTION_REQUIRED');
    }
    return resumeSecureUpload(ownerId, existing.uploadId, options);
  }
  const ticket = await withJournalLock(async () => {
    const current = compactCompletedForInsert(await readPending());
    const repeated = current.find(
      (item) =>
        item.ownerId === ownerId &&
        item.recoveryKey === recoveryKey &&
        item.purpose === purpose &&
        item.resourceId === resourceId &&
        item.mediaFingerprint === mediaFingerprint,
    );
    if (repeated) throw new Error('UPLOAD_RECOVERY_CONCURRENT_START');
    if (
      current.filter((item) => item.ownerId === ownerId && item.state !== 'completed').length >=
      maxPendingUploads
    ) {
      throw new Error('UPLOAD_RECOVERY_CAPACITY_EXCEEDED');
    }
    if (current.length >= maxJournalRecords) {
      throw new Error('UPLOAD_RECOVERY_JOURNAL_CAPACITY_EXCEEDED');
    }
    const ticketResponse =
      'resourceId' in input
        ? await supabase.rpc('create_resource_file_upload', {
            p_purpose: resourcePurposeSchema.parse(input.purpose),
            p_resource_id: z.uuid().parse(input.resourceId),
            p_filename: input.filename,
            p_declared_mime_type: input.mimeType,
            p_size_bytes: input.bytes.byteLength,
          })
        : await supabase.rpc('create_unbound_file_upload', {
            p_purpose: unboundPurposeSchema.parse(input.purpose),
            p_filename: input.filename,
            p_declared_mime_type: input.mimeType,
            p_size_bytes: input.bytes.byteLength,
          });
    if (ticketResponse.error) throw new Error('UPLOAD_TICKET_FAILED');
    const parsedTicket = ticketSchema.parse(ticketResponse.data);
    const record = pendingUploadSchema.parse({
      uploadId: parsedTicket.uploadId,
      operationId: createRandomId(),
      ownerId,
      recoveryKey,
      purpose,
      resourceId,
      mediaFingerprint,
      createdAt: new Date().toISOString(),
      state: 'quarantine_pending',
    });
    await writePending([...current, record]);
    return parsedTicket;
  });
  const { error: uploadError } = await supabase.storage
    .from(ticket.bucket)
    .upload(ticket.path, input.bytes, {
      contentType: ticket.contentType,
      cacheControl: '0',
      upsert: false,
    });
  if (uploadError) throw new Error('QUARANTINE_UPLOAD_FAILED');

  const record = (await readPending()).find(
    (item) => item.ownerId === ownerId && item.uploadId === ticket.uploadId,
  );
  if (!record || record.state !== 'quarantine_pending') {
    throw new Error('UPLOAD_RECOVERY_JOURNAL_INVALID');
  }
  await replacePending({ ...record, state: 'uploaded' });
  return resumeSecureUpload(ownerId, ticket.uploadId, options);
}
