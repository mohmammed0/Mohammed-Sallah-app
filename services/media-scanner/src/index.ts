import { setTimeout as delay } from 'node:timers/promises';

import { ClamdClient, type ClamdClientOptions } from './clamd.js';
import { createScannerControlClient } from './control-client.js';
import { createScannerPipeline } from './pipeline.js';
import { createMediaScannerWorker, type MediaScannerWorker } from './worker.js';
import {
  createScannerHealthMonitor,
  SCANNER_HEARTBEAT_INTERVAL_MS,
  type ScannerHealthRecord,
} from './operational-health.js';

export interface MediaScannerRuntimeConfig {
  readonly workerId: string;
  readonly controlOrigin: string;
  readonly storageOrigin: string;
  readonly allowHttp: boolean;
  readonly controlSecret: string;
  readonly attestationSecret: string;
  readonly signatureMaxAgeSeconds: number;
  readonly tempRoot: string;
  readonly clamd: ClamdClientOptions;
}

export function createMediaScannerRuntime(config: MediaScannerRuntimeConfig): MediaScannerWorker {
  const clamd = new ClamdClient(config.clamd);
  const control = createScannerControlClient({
    controlOrigin: config.controlOrigin,
    controlSecret: config.controlSecret,
    workerId: config.workerId,
    allowHttp: config.allowHttp,
  });
  return createMediaScannerWorker({
    workerId: config.workerId,
    storageOrigin: config.storageOrigin,
    allowHttp: config.allowHttp,
    signatureMaxAgeSeconds: config.signatureMaxAgeSeconds,
    attestationSecret: config.attestationSecret,
    tempRoot: config.tempRoot,
    control,
    pipeline: createScannerPipeline({ malwareScanner: clamd }),
    readiness: (signal) => clamd.readiness(signal),
  });
}

export async function runMediaScannerPullLoop(
  worker: MediaScannerWorker,
  options: {
    readonly idleDelayMs: number;
    readonly signal: AbortSignal;
    readonly onHealth?: (record: ScannerHealthRecord) => void;
  },
): Promise<void> {
  if (!Number.isSafeInteger(options.idleDelayMs) || options.idleDelayMs < 100) {
    throw new Error('invalid_pull_loop_configuration');
  }
  const monitor = createScannerHealthMonitor();
  let healthWriteFailed = false;
  const publish = () => {
    try {
      options.onHealth?.(monitor.snapshot());
    } catch {
      healthWriteFailed = true;
    }
  };
  publish();
  const timer = options.onHealth ? setInterval(publish, SCANNER_HEARTBEAT_INTERVAL_MS) : undefined;
  try {
    while (!options.signal.aborted) {
      if (healthWriteFailed) throw new Error('scanner_health_write_failed');
      let result;
      try {
        result = await worker.runOne(() => {
          monitor.ready();
          publish();
        });
      } catch (error) {
        monitor.failed(error instanceof Error && error.message === 'scanner_cleanup_failed');
        publish();
      }
      // The operational boundary retains only the allowlisted category, never a raw cause.
      if (!result) throw new Error('scanner_worker_stopped');
      monitor.result(result);
      publish();
      if (healthWriteFailed) throw new Error('scanner_health_write_failed');
      if (options.signal.aborted) break;
      if (result.status === 'idle' || result.status === 'retryable_failure') {
        await delay(options.idleDelayMs, undefined, { signal: options.signal }).catch(
          (error: unknown) => {
            if (!options.signal.aborted) throw error;
          },
        );
      }
    }
  } finally {
    if (timer !== undefined) clearInterval(timer);
    monitor.stop();
    publish();
  }
}

export * from './auth.js';
export * from './capability-http.js';
export * from './clamd.js';
export * from './contracts.js';
export * from './control-client.js';
export * from './deadline.js';
export * from './ffmpeg-remux.js';
export * from './manifest.js';
export * from './media-policy.js';
export * from './isolated-sanitizer.js';
export * from './pipeline.js';
export * from './worker.js';
export * from './operational-health.js';
