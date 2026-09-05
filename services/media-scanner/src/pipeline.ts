import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';

import {
  MAX_UPLOAD_BYTES,
  type AcceptedMediaMimeType,
  type UploadMimeType,
  type UploadPurpose,
} from './contracts.js';
import type { AttemptDeadline } from './deadline.js';
import type { ClamdScanResult } from './clamd.js';
import {
  createIsolatedImageSanitizer,
  type IsolatedImageSanitizer,
  IsolatedSanitizerError,
} from './isolated-sanitizer.js';

export type ScannerPipelineErrorCode =
  | 'internal_failure'
  | 'invalid_request'
  | 'malware_detected'
  | 'media_rejected'
  | 'scanner_busy'
  | 'scanner_unavailable';

export class ScannerPipelineError extends Error {
  override readonly name = 'ScannerPipelineError';

  constructor(readonly code: ScannerPipelineErrorCode) {
    super(code);
  }
}

export interface MalwareScanner {
  scanFile(path: string, signal?: AbortSignal): Promise<ClamdScanResult>;
}

export interface ScannerPipelineInput {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly purpose: UploadPurpose;
  readonly declaredMimeType: UploadMimeType;
  readonly deadline: AttemptDeadline;
}

export interface ProcessedMedia {
  readonly detectedInputMime: AcceptedMediaMimeType;
  readonly detectedOutputMime: AcceptedMediaMimeType;
  readonly inputSize: number;
  readonly outputSize: number;
  readonly inputSha256: string;
  readonly outputSha256: string;
  readonly originalScan: 'clean';
  readonly finalScan: 'clean';
  readonly sanitized: true;
  readonly sanitizer: string;
  readonly sanitizerVersion: string;
  readonly clamavEngineVersion: string;
  readonly signatureVersion: string;
  readonly signatureTimestamp: string;
  readonly signatureAgeSeconds: number;
}

export interface ScannerPipeline {
  process(input: ScannerPipelineInput): Promise<ProcessedMedia>;
}

export interface ScannerPipelineOptions {
  readonly malwareScanner: MalwareScanner;
  readonly sanitizer?: IsolatedImageSanitizer;
}

async function digestFile(path: string, expectedSize: number): Promise<string> {
  const digest = createHash('sha256');
  let size = 0;
  for await (const value of createReadStream(path)) {
    const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
    size += chunk.byteLength;
    if (size > expectedSize || size > MAX_UPLOAD_BYTES) {
      throw new ScannerPipelineError('invalid_request');
    }
    digest.update(chunk);
  }
  if (size !== expectedSize) throw new ScannerPipelineError('invalid_request');
  return digest.digest('hex');
}

function requireClean(
  result: ClamdScanResult,
): asserts result is Extract<ClamdScanResult, { verdict: 'clean' }> {
  if (result.verdict === 'malicious') throw new ScannerPipelineError('malware_detected');
}

export function createScannerPipeline(options: ScannerPipelineOptions): ScannerPipeline {
  const sanitizer = options.sanitizer ?? createIsolatedImageSanitizer();
  let active = false;
  return {
    async process(input) {
      if (active) throw new ScannerPipelineError('scanner_busy');
      active = true;
      try {
        input.deadline.assertActive();
        const inputStat = await stat(input.inputPath);
        if (!inputStat.isFile() || inputStat.size <= 0 || inputStat.size > MAX_UPLOAD_BYTES) {
          throw new ScannerPipelineError('invalid_request');
        }
        const inputSha256 = await digestFile(input.inputPath, inputStat.size);
        const original = await options.malwareScanner.scanFile(
          input.inputPath,
          input.deadline.signal,
        );
        requireClean(original);
        input.deadline.assertActive();
        let sanitized;
        try {
          sanitized = await sanitizer({
            inputPath: input.inputPath,
            outputPath: input.outputPath,
            purpose: input.purpose,
            declaredMimeType: input.declaredMimeType,
            deadline: input.deadline,
          });
        } catch (error) {
          if (
            error instanceof IsolatedSanitizerError &&
            error.code === 'sanitizer_media_rejected'
          ) {
            throw new ScannerPipelineError('media_rejected');
          }
          throw error;
        }
        input.deadline.assertActive();
        const final = await options.malwareScanner.scanFile(
          input.outputPath,
          input.deadline.signal,
        );
        requireClean(final);
        input.deadline.assertActive();
        return {
          detectedInputMime: sanitized.detectedMimeType,
          detectedOutputMime: sanitized.detectedMimeType,
          inputSize: inputStat.size,
          outputSize: sanitized.outputSize,
          inputSha256,
          outputSha256: sanitized.outputSha256,
          originalScan: 'clean',
          finalScan: 'clean',
          sanitized: true,
          sanitizer: sanitized.sanitizerId,
          sanitizerVersion: sanitized.sanitizerVersion,
          clamavEngineVersion: final.engineVersion,
          signatureVersion: final.signatureVersion,
          signatureTimestamp: final.signatureTimestamp,
          signatureAgeSeconds: final.signatureAgeSeconds,
        };
      } catch (error) {
        if (error instanceof ScannerPipelineError) throw error;
        throw new ScannerPipelineError('scanner_unavailable');
      } finally {
        active = false;
      }
    },
  };
}
