import { createHash, randomUUID } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';

import {
  downloadCapability,
  type DownloadCapabilityOptions,
  type FileDigest,
  uploadCapability,
  type UploadCapabilityOptions,
} from './capability-http.js';
import type { ScanClaim } from './control-client.js';
import type { AcceptedMediaMimeType } from './contracts.js';
import { AttemptDeadline, DeadlineError } from './deadline.js';
import { ClamdClientError, type ClamdVersionEvidence } from './clamd.js';
import {
  fingerprintAttestation,
  parseAttestation,
  signAttestation,
  type ScannerAttestation,
} from './manifest.js';
import { ScannerPipelineError, type ProcessedMedia, type ScannerPipeline } from './pipeline.js';

export interface PrepareOutputInput {
  readonly attemptId: string;
  readonly attemptToken: string;
  readonly prepareFingerprint: string;
  readonly inputMime: AcceptedMediaMimeType;
  readonly outputMime: AcceptedMediaMimeType;
  readonly inputSize: number;
  readonly outputSize: number;
  readonly inputSha256: string;
  readonly outputSha256: string;
  readonly sanitizer: string;
  readonly sanitizerVersion: string;
  readonly jobDeadline: string;
}

export interface CompleteInput {
  readonly attemptId: string;
  readonly attemptToken: string;
  readonly manifestFingerprint: string;
  readonly manifest: ScannerAttestation;
  readonly attestationSignature: string;
}

export interface ScannerWorkerControl {
  claim(
    this: void,
    input: {
      readonly workerId: string;
      readonly signatureTimestamp: string;
      readonly signatureMaxAgeSeconds: number;
    },
  ): Promise<{ status: 'idle' } | ScanClaim>;
  prepareOutput(
    this: void,
    input: PrepareOutputInput,
  ): Promise<{
    readonly status: 'output_prepared';
    readonly attemptId: string;
    readonly outputRef: string;
    readonly uploadUrl: string;
    readonly upsert: false;
    readonly processingDeadline: string;
  }>;
  authorizeReadback(
    this: void,
    input: {
      readonly attemptId: string;
      readonly attemptToken: string;
      readonly outputSize: number;
      readonly outputSha256: string;
    },
  ): Promise<{
    readonly status: 'readback_authorized';
    readonly attemptId: string;
    readonly outputRef: string;
    readonly readUrl: string;
  }>;
  complete(
    this: void,
    input: CompleteInput,
  ): Promise<{
    readonly status: 'clean';
    readonly attemptId: string;
    readonly sanitized: true;
    readonly mimeType: AcceptedMediaMimeType;
    readonly sizeBytes: number;
  }>;
  reject(
    this: void,
    input: {
      readonly attemptId: string;
      readonly attemptToken: string;
      readonly failureCategory: string;
    },
  ): Promise<{ readonly status: 'rejected'; readonly attemptId: string }>;
  fail(
    this: void,
    input: {
      readonly attemptId: string;
      readonly attemptToken: string;
      readonly failureCategory: string;
    },
  ): Promise<{
    readonly status: 'retryable_failure' | 'terminal_failure';
    readonly attemptId: string;
  }>;
}

export type WorkerFailureCategory =
  | 'signature_stale'
  | 'signature_invalid'
  | 'readiness_unavailable'
  | 'control_unavailable'
  | 'processing_failed'
  | 'processing_timeout';

export type WorkerRunResult = (
  | { readonly status: 'idle' }
  | { readonly status: 'clean'; readonly attemptId: string }
  | { readonly status: 'rejected'; readonly attemptId: string }
  | { readonly status: 'retryable_failure'; readonly attemptId?: string }
  | { readonly status: 'terminal_failure'; readonly attemptId: string }
) & { readonly category?: WorkerFailureCategory };

export interface MediaScannerWorkerOptions {
  readonly workerId: string;
  readonly storageOrigin: string;
  readonly allowHttp: boolean;
  readonly signatureMaxAgeSeconds: number;
  readonly attestationSecret: string;
  readonly tempRoot: string;
  readonly control: ScannerWorkerControl;
  readonly pipeline: ScannerPipeline;
  readonly readiness: (signal?: AbortSignal) => Promise<ClamdVersionEvidence>;
  readonly download?: (options: DownloadCapabilityOptions) => Promise<FileDigest>;
  readonly upload?: (options: UploadCapabilityOptions) => Promise<void>;
  readonly uuid?: () => string;
  readonly nowMs?: () => number;
  readonly monotonicMs?: () => number;
}

export interface MediaScannerWorker {
  runOne(this: void, onReady?: () => void): Promise<WorkerRunResult>;
}

async function cleanupAttemptDirectory(path: string | undefined): Promise<void> {
  if (!path) return;
  try {
    await rm(path, { recursive: true, force: true });
  } catch {
    throw new Error('scanner_cleanup_failed');
  }
}

function prepareFingerprint(processed: ProcessedMedia): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        inputMime: processed.detectedInputMime,
        outputMime: processed.detectedOutputMime,
        inputSize: processed.inputSize,
        outputSize: processed.outputSize,
        inputSha256: processed.inputSha256,
        outputSha256: processed.outputSha256,
        sanitizer: processed.sanitizer,
        sanitizerVersion: processed.sanitizerVersion,
      }),
      'utf8',
    )
    .digest('hex');
}

function inputSignedPath(reference: string): string {
  return `/storage/v1/object/sign/scan-input/${reference}`;
}

function outputUploadPath(reference: string): string {
  return `/storage/v1/s3/scan-output/${reference}`;
}

function outputReadPath(reference: string): string {
  return `/storage/v1/object/sign/scan-output/${reference}`;
}

function safeFailureCategory(error: unknown): string {
  if (error instanceof ScannerPipelineError) return error.code;
  if (error instanceof DeadlineError) return error.code;
  if (error instanceof Error && error.message === 'stored_output_integrity_mismatch') {
    return error.message;
  }
  return 'scanner_worker_failure';
}

export function createMediaScannerWorker(options: MediaScannerWorkerOptions): MediaScannerWorker {
  const download = options.download ?? downloadCapability;
  const upload = options.upload ?? uploadCapability;
  const uuid = options.uuid ?? randomUUID;
  const nowMs = options.nowMs ?? Date.now;
  let active = false;

  return {
    async runOne(onReady?: () => void): Promise<WorkerRunResult> {
      if (active) return { status: 'retryable_failure' };
      active = true;
      let claim: ScanClaim | undefined;
      let deadline: AttemptDeadline | undefined;
      let attemptDirectory: string | undefined;
      let stage: 'readiness' | 'control' | 'processing' = 'readiness';
      try {
        const ready = await options.readiness();
        if (!Number.isSafeInteger(ready.signatureAgeSeconds) || ready.signatureAgeSeconds < 0)
          return { status: 'retryable_failure', category: 'signature_invalid' };
        if (ready.signatureAgeSeconds > options.signatureMaxAgeSeconds)
          return { status: 'retryable_failure', category: 'signature_stale' };
        stage = 'control';
        const claimed = await options.control.claim({
          workerId: options.workerId,
          signatureTimestamp: ready.signatureTimestamp,
          signatureMaxAgeSeconds: options.signatureMaxAgeSeconds,
        });
        stage = 'processing';
        onReady?.();
        if (claimed.status === 'idle') return claimed;
        claim = claimed;
        try {
          deadline = new AttemptDeadline({
            processingDeadline: claim.processingDeadline,
            nowMs,
            ...(options.monotonicMs ? { monotonicMs: options.monotonicMs } : {}),
          });
        } catch (error) {
          if (error instanceof DeadlineError) {
            return {
              status: 'retryable_failure',
              category: 'processing_timeout',
              attemptId: claim.attemptId,
            };
          }
          throw error;
        }
        deadline.assertActive();
        attemptDirectory = await mkdtemp(join(options.tempRoot, 'attempt-'));
        const inputPath = join(attemptDirectory, 'input.media');
        const outputPath = join(attemptDirectory, 'output.media');
        const readbackPath = join(attemptDirectory, 'readback.media');
        const inputDigest = await download({
          url: claim.inputUrl,
          expectedOrigin: options.storageOrigin,
          expectedPath: inputSignedPath(claim.inputRef),
          allowHttp: options.allowHttp,
          destinationPath: inputPath,
          expectedSize: claim.sizeBytes,
          maxBytes: claim.maxSizeBytes,
          signal: deadline.signal,
        });
        deadline.assertActive();
        const processed = await options.pipeline.process({
          inputPath,
          outputPath,
          purpose: claim.purpose,
          declaredMimeType: claim.declaredMimeType,
          deadline,
        });
        if (
          processed.inputSize !== inputDigest.size ||
          processed.inputSha256 !== inputDigest.sha256
        )
          throw new Error('stored_output_integrity_mismatch');
        deadline.assertActive();
        const prepared = await options.control.prepareOutput({
          attemptId: claim.attemptId,
          attemptToken: claim.attemptToken,
          prepareFingerprint: prepareFingerprint(processed),
          inputMime: processed.detectedInputMime,
          outputMime: processed.detectedOutputMime,
          inputSize: processed.inputSize,
          outputSize: processed.outputSize,
          inputSha256: processed.inputSha256,
          outputSha256: processed.outputSha256,
          sanitizer: processed.sanitizer,
          sanitizerVersion: processed.sanitizerVersion,
          jobDeadline: claim.processingDeadline,
        });
        if (
          prepared.attemptId !== claim.attemptId ||
          prepared.processingDeadline !== claim.processingDeadline ||
          prepared.upsert !== false
        )
          throw new Error('scanner_worker_failure');
        deadline.assertActive();
        let ambiguousUploadError: unknown;
        try {
          await upload({
            url: prepared.uploadUrl,
            expectedOrigin: options.storageOrigin,
            expectedPath: outputUploadPath(prepared.outputRef),
            allowHttp: options.allowHttp,
            sourcePath: outputPath,
            expectedSize: processed.outputSize,
            expectedSha256: processed.outputSha256,
            contentType: processed.detectedOutputMime,
            signal: deadline.signal,
          });
        } catch (error) {
          // A failed transport can mean the exact no-upsert object was stored but its response was
          // lost. The control plane rechecks current-attempt metadata before issuing readback.
          ambiguousUploadError = error;
        }
        deadline.assertActive();
        let readback;
        try {
          readback = await options.control.authorizeReadback({
            attemptId: claim.attemptId,
            attemptToken: claim.attemptToken,
            outputSize: processed.outputSize,
            outputSha256: processed.outputSha256,
          });
        } catch (error) {
          throw ambiguousUploadError ?? error;
        }
        if (readback.attemptId !== claim.attemptId || readback.outputRef !== prepared.outputRef) {
          throw new Error('stored_output_integrity_mismatch');
        }
        const stored = await download({
          url: readback.readUrl,
          expectedOrigin: options.storageOrigin,
          expectedPath: outputReadPath(readback.outputRef),
          allowHttp: options.allowHttp,
          destinationPath: readbackPath,
          expectedSize: processed.outputSize,
          maxBytes: claim.maxSizeBytes,
          signal: deadline.signal,
        });
        if (stored.size !== processed.outputSize || stored.sha256 !== processed.outputSha256) {
          throw new Error('stored_output_integrity_mismatch');
        }
        deadline.assertActive();
        const calculatedAge = Math.floor(
          (nowMs() - Date.parse(processed.signatureTimestamp)) / 1_000,
        );
        if (
          !Number.isSafeInteger(calculatedAge) ||
          calculatedAge < 0 ||
          calculatedAge > options.signatureMaxAgeSeconds
        )
          throw new Error('scanner_worker_failure');
        const manifest = parseAttestation({
          schemaVersion: 'sallah-media-attestation-v1',
          attemptId: claim.attemptId,
          inputRef: claim.inputRef,
          outputRef: prepared.outputRef,
          purpose: claim.purpose,
          detectedInputMime: processed.detectedInputMime,
          detectedOutputMime: processed.detectedOutputMime,
          inputSize: processed.inputSize,
          outputSize: processed.outputSize,
          inputSha256: processed.inputSha256,
          outputSha256: processed.outputSha256,
          originalScan: processed.originalScan,
          finalScan: processed.finalScan,
          sanitized: processed.sanitized,
          sanitizer: processed.sanitizer,
          sanitizerVersion: processed.sanitizerVersion,
          clamavEngineVersion: processed.clamavEngineVersion,
          signatureVersion: processed.signatureVersion,
          signatureTimestamp: processed.signatureTimestamp,
          signatureAgeSeconds: calculatedAge,
          processingDurationMs: Math.min(120_000, deadline.elapsedMs()),
          jobDeadline: claim.processingDeadline,
          nonce: uuid(),
          correlationId: uuid(),
          readbackSha256: stored.sha256,
          storageFingerprint: stored.storageFingerprint,
        });
        const result = await options.control.complete({
          attemptId: claim.attemptId,
          attemptToken: claim.attemptToken,
          manifestFingerprint: fingerprintAttestation(manifest),
          manifest,
          attestationSignature: signAttestation(manifest, options.attestationSecret),
        });
        return { status: result.status, attemptId: result.attemptId };
      } catch (error) {
        if (!claim || !deadline) {
          const category: WorkerFailureCategory =
            stage === 'readiness'
              ? error instanceof ClamdClientError && error.code === 'signature_stale'
                ? 'signature_stale'
                : error instanceof ClamdClientError &&
                    (error.code === 'signature_future' || error.code === 'signature_unparseable')
                  ? 'signature_invalid'
                  : 'readiness_unavailable'
              : stage === 'control'
                ? 'control_unavailable'
                : 'processing_failed';
          return { status: 'retryable_failure', category };
        }
        const category = safeFailureCategory(error);
        if (deadline.remainingMs() <= 0 || deadline.signal.aborted) {
          return {
            status: 'retryable_failure',
            category: 'processing_timeout',
            attemptId: claim.attemptId,
          };
        }
        if (
          error instanceof ScannerPipelineError &&
          (error.code === 'media_rejected' || error.code === 'malware_detected')
        ) {
          try {
            const result = await options.control.reject({
              attemptId: claim.attemptId,
              attemptToken: claim.attemptToken,
              failureCategory: category,
            });
            return result;
          } catch {
            return {
              status: 'retryable_failure',
              category: 'control_unavailable',
              attemptId: claim.attemptId,
            };
          }
        }
        try {
          const result = await options.control.fail({
            attemptId: claim.attemptId,
            attemptToken: claim.attemptToken,
            failureCategory: category,
          });
          return { ...result, category: 'processing_failed' };
        } catch {
          return {
            status: 'retryable_failure',
            category: 'control_unavailable',
            attemptId: claim.attemptId,
          };
        }
      } finally {
        deadline?.dispose();
        try {
          await cleanupAttemptDirectory(attemptDirectory);
        } finally {
          active = false;
        }
      }
    },
  };
}
