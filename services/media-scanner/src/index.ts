import { setTimeout as delay } from 'node:timers/promises';

import { ClamdClient, type ClamdClientOptions } from './clamd.js';
import { createScannerControlClient } from './control-client.js';
import { createScannerPipeline } from './pipeline.js';
import { createMediaScannerWorker, type MediaScannerWorker } from './worker.js';

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
  options: { readonly idleDelayMs: number; readonly signal: AbortSignal },
): Promise<void> {
  if (!Number.isSafeInteger(options.idleDelayMs) || options.idleDelayMs < 100) {
    throw new Error('invalid_pull_loop_configuration');
  }
  while (!options.signal.aborted) {
    const result = await worker.runOne();
    if (options.signal.aborted) break;
    if (result.status === 'idle' || result.status === 'retryable_failure') {
      await delay(options.idleDelayMs, undefined, { signal: options.signal }).catch(
        (error: unknown) => {
          if (!options.signal.aborted) throw error;
        },
      );
    }
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
