import { describe, expect, it, vi } from 'vitest';

import { runMediaScannerPullLoop } from '../src/index.js';
import type { MediaScannerWorker } from '../src/worker.js';
import type { WorkerRunResult } from '../src/worker.js';
import type { ScannerHealthRecord } from '../src/operational-health.js';

describe('bounded one-job scanner pull loop', () => {
  it('publishes a heartbeat during a long job, expires readiness for a hung job and stops its timer', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      const records: ScannerHealthRecord[] = [];
      let finish: ((result: WorkerRunResult) => void) | undefined;
      const worker: MediaScannerWorker = {
        runOne: (onReady) => {
          onReady?.();
          return new Promise<WorkerRunResult>((resolve) => {
            finish = resolve;
          });
        },
      };
      const loop = runMediaScannerPullLoop(worker, {
        idleDelayMs: 100,
        signal: controller.signal,
        onHealth: (record) => records.push(record),
      });
      expect(records[0]).toMatchObject({ state: 'starting' });
      expect(records.at(-1)).toMatchObject({ state: 'healthy', category: 'ready' });
      await vi.advanceTimersByTimeAsync(120_000);
      expect(records.at(-1)).toMatchObject({ state: 'healthy' });
      await vi.advanceTimersByTimeAsync(40_000);
      expect(records.at(-1)).toMatchObject({ state: 'degraded', category: 'readiness_expired' });
      controller.abort();
      expect(finish).toBeTypeOf('function');
      finish?.({ status: 'idle' });
      await loop;
      expect(records.at(-1)).toMatchObject({ state: 'stopped' });
      const count = records.length;
      await vi.advanceTimersByTimeAsync(30_000);
      expect(records).toHaveLength(count);
    } finally {
      vi.useRealTimers();
    }
  });

  it('contains fatal raw errors and reports cleanup failure without leaking details', async () => {
    const records: ScannerHealthRecord[] = [];
    const worker: MediaScannerWorker = {
      runOne: () => Promise.reject(new Error('scanner_cleanup_failed')),
    };
    await expect(
      runMediaScannerPullLoop(worker, {
        idleDelayMs: 100,
        signal: new AbortController().signal,
        onHealth: (record) => records.push(record),
      }),
    ).rejects.toThrow('scanner_worker_stopped');
    expect(records).toContainEqual(
      expect.objectContaining({ state: 'degraded', category: 'cleanup_failed' }),
    );
    expect(records.at(-1)).toMatchObject({ state: 'stopped', category: 'cleanup_failed' });
    const privateWorker: MediaScannerWorker = {
      runOne: () => Promise.reject(new Error('https://private.example/?token=secret')),
    };
    await expect(
      runMediaScannerPullLoop(privateWorker, {
        idleDelayMs: 100,
        signal: new AbortController().signal,
        onHealth: (record) => records.push(record),
      }),
    ).rejects.toThrow('scanner_worker_stopped');
    expect(JSON.stringify(records)).not.toMatch(/https:|token|secret/);
  });

  it('does not claim work if the initial health record cannot be published', async () => {
    const worker: MediaScannerWorker = {
      runOne: vi.fn(() => Promise.resolve({ status: 'idle' as const })),
    };
    await expect(
      runMediaScannerPullLoop(worker, {
        idleDelayMs: 100,
        signal: new AbortController().signal,
        onHealth: () => {
          throw new Error('/private/path');
        },
      }),
    ).rejects.toThrow('scanner_health_write_failed');
    expect(worker.runOne).not.toHaveBeenCalled();
  });

  it('backs off after a retryable control failure instead of hot-looping', async () => {
    vi.useFakeTimers();
    try {
      const controller = new AbortController();
      let runs = 0;
      const worker: MediaScannerWorker = {
        runOne: vi.fn(() => {
          runs += 1;
          if (runs === 2) controller.abort();
          return Promise.resolve({ status: 'retryable_failure' as const });
        }),
      };
      const loop = runMediaScannerPullLoop(worker, {
        idleDelayMs: 100,
        signal: controller.signal,
      });

      await vi.waitFor(() => expect(runs).toBeGreaterThan(0));
      expect(runs).toBe(1);
      await vi.advanceTimersByTimeAsync(99);
      expect(runs).toBe(1);
      await vi.advanceTimersByTimeAsync(1);
      await loop;
      expect(runs).toBe(2);
    } finally {
      vi.useRealTimers();
    }
  });
});
