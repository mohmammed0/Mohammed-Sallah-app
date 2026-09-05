import {
  closeSync,
  constants,
  fstatSync,
  lstatSync,
  openSync,
  readSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs';

import { z } from 'zod';

import type { WorkerRunResult } from './worker.js';

export const SCANNER_HEALTH_PATH = '/tmp/scanner-health/state.json';
export const SCANNER_HEARTBEAT_INTERVAL_MS = 10_000;
const HEARTBEAT_MAX_AGE_MS = 30_000;
// A claimed job is bounded to 120 seconds; allow one heartbeat/metadata margin.
const READINESS_MAX_AGE_MS = 150_000;
const MAX_HEALTH_BYTES = 1_024;
const healthyCategories = new Set(['ready', 'idle', 'clean', 'rejected']);
const failureCategorySchema = z.enum([
  'signature_stale',
  'signature_invalid',
  'readiness_unavailable',
  'control_unavailable',
  'processing_failed',
  'processing_timeout',
]);
const categorySchema = z.enum([
  'starting',
  'ready',
  'idle',
  'clean',
  'rejected',
  ...failureCategorySchema.options,
  'readiness_expired',
  'worker_failed',
  'cleanup_failed',
  'stopped',
]);
const timestampSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const healthSchema = z
  .object({
    schema: z.literal('sallah.scanner-health.v1'),
    observedAtMs: timestampSchema,
    lastReadyAtMs: timestampSchema.nullable(),
    state: z.enum(['starting', 'healthy', 'degraded', 'stopped']),
    category: categorySchema,
  })
  .strict();

export type ScannerHealthRecord = z.infer<typeof healthSchema>;

export function createScannerHealthMonitor(nowMs: () => number = Date.now) {
  let state: ScannerHealthRecord['state'] = 'starting';
  let category: ScannerHealthRecord['category'] = 'starting';
  let lastReadyAtMs: number | null = null;
  return {
    ready() {
      lastReadyAtMs = nowMs();
      state = 'healthy';
      category = 'ready';
    },
    result(result: WorkerRunResult) {
      if (result.status === 'idle' || result.status === 'clean' || result.status === 'rejected') {
        state = 'healthy';
        category = result.status;
      } else {
        state = 'degraded';
        const parsed = failureCategorySchema.safeParse(result.category);
        category = parsed.success ? parsed.data : 'processing_failed';
      }
    },
    failed(cleanup: boolean) {
      state = 'degraded';
      category = cleanup ? 'cleanup_failed' : 'worker_failed';
    },
    stop() {
      if (state !== 'degraded') category = 'stopped';
      state = 'stopped';
    },
    snapshot(): ScannerHealthRecord {
      const observedAtMs = nowMs();
      if (
        state === 'healthy' &&
        (lastReadyAtMs === null ||
          observedAtMs < lastReadyAtMs ||
          observedAtMs - lastReadyAtMs > READINESS_MAX_AGE_MS)
      ) {
        state = 'degraded';
        category = 'readiness_expired';
      }
      return { schema: 'sallah.scanner-health.v1', observedAtMs, lastReadyAtMs, state, category };
    },
  };
}

export function createScannerHealthPublisher(
  path: string,
  log: (line: string) => void = console.log,
) {
  let lastLogAt: number | null = null;
  let lastLogState: ScannerHealthRecord['state'] | undefined;
  return (record: ScannerHealthRecord): void => {
    const parsed = healthSchema.safeParse(record);
    if (!parsed.success) throw new Error('scanner_health_record_invalid');
    const value = parsed.data;
    const serialized = `${JSON.stringify(value)}\n`;
    const next = `${path}.next`;
    try {
      // The directory is a dedicated private tmpfs, separate from untrusted media.
      // Exclusive create and atomic rename never follow a leftover file symlink.
      try {
        unlinkSync(next);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error;
      }
      writeFileSync(next, serialized, { flag: 'wx', mode: 0o600 });
      renameSync(next, path);
    } catch {
      throw new Error('scanner_health_write_failed');
    }
    const elapsed = lastLogAt === null ? Number.POSITIVE_INFINITY : value.observedAtMs - lastLogAt;
    if (
      lastLogAt === null ||
      value.state === 'stopped' ||
      elapsed >= 60_000 ||
      (elapsed >= 5_000 && value.state !== lastLogState)
    ) {
      log(serialized.trimEnd());
      lastLogAt = value.observedAtMs;
      lastLogState = value.state;
    }
  };
}

export function readScannerHealth(path: string, nowMs = Date.now()): boolean {
  let descriptor: number | undefined;
  try {
    if (!Number.isSafeInteger(nowMs) || lstatSync(path).isSymbolicLink()) return false;
    descriptor = openSync(path, constants.O_RDONLY | (constants.O_NOFOLLOW ?? 0));
    const stat = fstatSync(descriptor);
    if (!stat.isFile() || stat.size === 0 || stat.size > MAX_HEALTH_BYTES) return false;
    const buffer = Buffer.alloc(MAX_HEALTH_BYTES + 1);
    const bytes = readSync(descriptor, buffer, 0, buffer.length, 0);
    if (bytes > MAX_HEALTH_BYTES) return false;
    const parsed = healthSchema.safeParse(
      JSON.parse(buffer.subarray(0, bytes).toString('utf8')) as unknown,
    );
    if (!parsed.success) return false;
    const value = parsed.data;
    return (
      value.state === 'healthy' &&
      healthyCategories.has(value.category) &&
      value.lastReadyAtMs !== null &&
      value.lastReadyAtMs <= value.observedAtMs &&
      value.observedAtMs <= nowMs &&
      nowMs - value.observedAtMs <= HEARTBEAT_MAX_AGE_MS &&
      nowMs - value.lastReadyAtMs <= READINESS_MAX_AGE_MS
    );
  } catch {
    return false;
  } finally {
    if (descriptor !== undefined) closeSync(descriptor);
  }
}
