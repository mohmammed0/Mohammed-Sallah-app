import { describe, expect, it, vi } from 'vitest';

import { runMediaScannerPullLoop } from '../src/index.js';
import type { MediaScannerWorker } from '../src/worker.js';

describe('bounded one-job scanner pull loop', () => {
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
