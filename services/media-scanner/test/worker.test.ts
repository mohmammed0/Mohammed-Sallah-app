import { createHash } from 'node:crypto';
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import type { FileDigest } from '../src/capability-http.js';
import {
  type ProcessedMedia,
  type ScannerPipeline,
  ScannerPipelineError,
} from '../src/pipeline.js';
import { createMediaScannerWorker, type ScannerWorkerControl } from '../src/worker.js';
import { onePixelPng } from './fixtures/v2-media.js';

const temporary: string[] = [];
const inputRef = 'aa/bb/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const outputRef = 'cc/dd/cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const attemptId = '11111111-1111-4111-8111-111111111111';
const attemptToken = '99999999-9999-4999-8999-999999999999';

afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map(async (path) => rm(path, { recursive: true, force: true })),
  );
});

function digest(bytes: Uint8Array): FileDigest {
  return {
    size: bytes.byteLength,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    storageFingerprint: createHash('md5').update(bytes).digest('hex'),
  };
}

function cleanProcessed(): ProcessedMedia {
  const value = digest(onePixelPng);
  return {
    detectedInputMime: 'image/png',
    detectedOutputMime: 'image/png',
    inputSize: value.size,
    outputSize: value.size,
    inputSha256: value.sha256,
    outputSha256: value.sha256,
    originalScan: 'clean',
    finalScan: 'clean',
    sanitized: true,
    sanitizer: 'decode-reencode-png-v1',
    sanitizerVersion: '1.0.0',
    clamavEngineVersion: '1.4.3',
    signatureVersion: '28000',
    signatureTimestamp: new Date(Date.now() - 60_000).toISOString(),
    signatureAgeSeconds: 60,
  };
}

function control(overrides: Partial<ScannerWorkerControl> = {}): ScannerWorkerControl {
  const processingDeadline = new Date(Date.now() + 120_000).toISOString();
  return {
    claim: vi.fn(() =>
      Promise.resolve({
        status: 'claimed' as const,
        attemptId,
        attemptToken,
        attemptOrdinal: 1,
        processingDeadline,
        purpose: 'request_media' as const,
        declaredMimeType: 'image/png' as const,
        sizeBytes: onePixelPng.byteLength,
        maxSizeBytes: 20 * 1024 * 1024,
        inputRef,
        inputUrl: `https://storage.example/storage/v1/object/sign/scan-input/${inputRef}?token=in`,
      }),
    ),
    prepareOutput: vi.fn(() =>
      Promise.resolve({
        status: 'output_prepared' as const,
        attemptId,
        outputRef,
        uploadUrl: `https://storage.example/storage/v1/object/upload/sign/scan-output/${outputRef}?token=out`,
        upsert: false as const,
        processingDeadline,
      }),
    ),
    authorizeReadback: vi.fn(() =>
      Promise.resolve({
        status: 'readback_authorized' as const,
        attemptId,
        outputRef,
        readUrl: `https://storage.example/storage/v1/object/sign/scan-output/${outputRef}?token=read`,
      }),
    ),
    complete: vi.fn(() =>
      Promise.resolve({
        status: 'clean' as const,
        attemptId,
        sanitized: true as const,
        mimeType: 'image/png' as const,
        sizeBytes: onePixelPng.byteLength,
      }),
    ),
    reject: vi.fn(() => Promise.resolve({ status: 'rejected' as const, attemptId })),
    fail: vi.fn(() => Promise.resolve({ status: 'retryable_failure' as const, attemptId })),
    ...overrides,
  };
}

describe('one-job no-credential pull worker', () => {
  it('pulls metadata, streams capabilities, scans twice before output authorization, verifies readback, attests, and cleans temp data', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sallah-worker-'));
    temporary.push(root);
    const order: string[] = [];
    const scannerControl = control({
      prepareOutput: vi.fn((input: Parameters<ScannerWorkerControl['prepareOutput']>[0]) => {
        order.push('prepare_output');
        expect(input.outputSha256).toBe(digest(onePixelPng).sha256);
        return Promise.resolve({
          status: 'output_prepared' as const,
          attemptId,
          outputRef,
          uploadUrl: `https://storage.example/storage/v1/object/upload/sign/scan-output/${outputRef}?token=out`,
          upsert: false as const,
          processingDeadline: input.jobDeadline,
        });
      }),
    });
    const pipeline: ScannerPipeline = {
      process: vi.fn(async ({ outputPath }: Parameters<ScannerPipeline['process']>[0]) => {
        order.push('first_scan_sanitize_final_scan');
        await writeFile(outputPath, onePixelPng);
        return cleanProcessed();
      }),
    };
    const download = vi.fn(async (input: { destinationPath: string; expectedPath: string }) => {
      await mkdir(dirname(input.destinationPath), { recursive: true });
      const output = input.expectedPath.includes('scan-output');
      order.push(output ? 'readback' : 'input_download');
      await writeFile(input.destinationPath, onePixelPng);
      return digest(onePixelPng);
    });
    const upload = vi.fn(() => {
      order.push('upload');
      return Promise.resolve();
    });
    const worker = createMediaScannerWorker({
      workerId: 'scanner-worker-1',
      storageOrigin: 'https://storage.example',
      allowHttp: false,
      signatureMaxAgeSeconds: 3_600,
      attestationSecret: 'attestation-secret-that-is-at-least-thirty-two-bytes',
      tempRoot: root,
      control: scannerControl,
      pipeline,
      readiness: () =>
        Promise.resolve({
          engineVersion: '1.4.3',
          signatureVersion: '28000',
          signatureTimestamp: '2026-08-21T12:00:00.000Z',
          signatureAgeSeconds: 60,
        }),
      download,
      upload,
      uuid: (() => {
        let value = 0;
        return () => `${String(++value).padStart(8, '0')}-0000-4000-8000-000000000000`;
      })(),
    });

    await expect(worker.runOne()).resolves.toMatchObject({ status: 'clean', attemptId });
    expect(order).toEqual([
      'input_download',
      'first_scan_sanitize_final_scan',
      'prepare_output',
      'upload',
      'readback',
    ]);
    expect(scannerControl.complete).toHaveBeenCalledTimes(1);
    const complete = vi.mocked(scannerControl.complete).mock.calls[0]?.[0];
    expect(complete?.manifest).toMatchObject({
      attemptId,
      inputRef,
      outputRef,
      originalScan: 'clean',
      finalScan: 'clean',
      readbackSha256: digest(onePixelPng).sha256,
      storageFingerprint: digest(onePixelPng).storageFingerprint,
    });
    expect(complete?.attestationSignature).toMatch(/^[0-9a-f]{64}$/);
    expect(await readdir(root)).toEqual([]);
  });

  it('fails closed before completion when stored-output readback does not match', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sallah-worker-'));
    temporary.push(root);
    const scannerControl = control();
    let downloads = 0;
    const worker = createMediaScannerWorker({
      workerId: 'scanner-worker-1',
      storageOrigin: 'https://storage.example',
      allowHttp: false,
      signatureMaxAgeSeconds: 3_600,
      attestationSecret: 'attestation-secret-that-is-at-least-thirty-two-bytes',
      tempRoot: root,
      control: scannerControl,
      pipeline: {
        process: async ({ outputPath }) => {
          await writeFile(outputPath, onePixelPng);
          return cleanProcessed();
        },
      },
      readiness: () =>
        Promise.resolve({
          engineVersion: '1.4.3',
          signatureVersion: '28000',
          signatureTimestamp: new Date(Date.now() - 60_000).toISOString(),
          signatureAgeSeconds: 60,
        }),
      download: async ({ destinationPath }) => {
        const bytes = ++downloads === 1 ? onePixelPng : Uint8Array.of(9);
        await writeFile(destinationPath, bytes);
        return digest(bytes);
      },
      upload: () => Promise.resolve(),
    });

    await expect(worker.runOne()).resolves.toMatchObject({ status: 'retryable_failure' });
    expect(scannerControl.complete).not.toHaveBeenCalled();
    expect(scannerControl.fail).toHaveBeenCalledWith(
      expect.objectContaining({ failureCategory: 'stored_output_integrity_mismatch' }),
    );
    expect(await readdir(root)).toEqual([]);
  });

  it('repairs a lost upload response by authorizing and hashing the exact staged object', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sallah-worker-'));
    temporary.push(root);
    const scannerControl = control();
    const worker = createMediaScannerWorker({
      workerId: 'scanner-worker-1',
      storageOrigin: 'https://storage.example',
      allowHttp: false,
      signatureMaxAgeSeconds: 3_600,
      attestationSecret: 'attestation-secret-that-is-at-least-thirty-two-bytes',
      tempRoot: root,
      control: scannerControl,
      pipeline: {
        process: async ({ outputPath }) => {
          await writeFile(outputPath, onePixelPng);
          return cleanProcessed();
        },
      },
      readiness: () =>
        Promise.resolve({
          engineVersion: '1.4.3',
          signatureVersion: '28000',
          signatureTimestamp: new Date(Date.now() - 60_000).toISOString(),
          signatureAgeSeconds: 60,
        }),
      download: async ({ destinationPath }) => {
        await writeFile(destinationPath, onePixelPng);
        return digest(onePixelPng);
      },
      upload: () => Promise.reject(new TypeError('upload_response_lost')),
    });

    await expect(worker.runOne()).resolves.toMatchObject({ status: 'clean', attemptId });
    expect(scannerControl.authorizeReadback).toHaveBeenCalledTimes(1);
    expect(scannerControl.complete).toHaveBeenCalledTimes(1);
    expect(scannerControl.fail).not.toHaveBeenCalled();
    expect(await readdir(root)).toEqual([]);
  });

  it('never downloads or reports through a stale attempt after the immutable lease expired', async () => {
    const root = await mkdtemp(join(tmpdir(), 'sallah-worker-'));
    temporary.push(root);
    const scannerControl = control({
      claim: vi.fn(() =>
        Promise.resolve({
          status: 'claimed' as const,
          attemptId,
          attemptToken,
          attemptOrdinal: 1,
          processingDeadline: '2026-08-21T12:00:00.000Z',
          purpose: 'request_media' as const,
          declaredMimeType: 'image/png' as const,
          sizeBytes: onePixelPng.byteLength,
          maxSizeBytes: 20 * 1024 * 1024,
          inputRef,
          inputUrl: `https://storage.example/storage/v1/object/sign/scan-input/${inputRef}?token=in`,
        }),
      ),
    });
    const download = vi.fn();
    const worker = createMediaScannerWorker({
      workerId: 'scanner-worker-1',
      storageOrigin: 'https://storage.example',
      allowHttp: false,
      signatureMaxAgeSeconds: 3_600,
      attestationSecret: 'attestation-secret-that-is-at-least-thirty-two-bytes',
      tempRoot: root,
      control: scannerControl,
      pipeline: { process: vi.fn() },
      readiness: () =>
        Promise.resolve({
          engineVersion: '1.4.3',
          signatureVersion: '28000',
          signatureTimestamp: '2026-08-21T11:59:00.000Z',
          signatureAgeSeconds: 60,
        }),
      download,
      upload: vi.fn(),
      nowMs: () => Date.parse('2026-08-21T12:00:01.000Z'),
    });

    await expect(worker.runOne()).resolves.toMatchObject({ status: 'retryable_failure' });
    expect(download).not.toHaveBeenCalled();
    expect(scannerControl.fail).not.toHaveBeenCalled();
    expect(scannerControl.reject).not.toHaveBeenCalled();
  });

  it.each([
    ['reject', new ScannerPipelineError('media_rejected')],
    ['fail', new Error('scanner_fault')],
  ] as const)(
    'contains a lost %s disposition response and returns a retryable attempt result',
    async (method, pipelineError) => {
      const root = await mkdtemp(join(tmpdir(), 'sallah-worker-'));
      temporary.push(root);
      const disposition = vi.fn(() => Promise.reject(new TypeError('response_lost')));
      const scannerControl =
        method === 'reject' ? control({ reject: disposition }) : control({ fail: disposition });
      const worker = createMediaScannerWorker({
        workerId: 'scanner-worker-1',
        storageOrigin: 'https://storage.example',
        allowHttp: false,
        signatureMaxAgeSeconds: 3_600,
        attestationSecret: 'attestation-secret-that-is-at-least-thirty-two-bytes',
        tempRoot: root,
        control: scannerControl,
        pipeline: { process: () => Promise.reject(pipelineError) },
        readiness: () =>
          Promise.resolve({
            engineVersion: '1.4.3',
            signatureVersion: '28000',
            signatureTimestamp: new Date(Date.now() - 60_000).toISOString(),
            signatureAgeSeconds: 60,
          }),
        download: async ({ destinationPath }) => {
          await writeFile(destinationPath, onePixelPng);
          return digest(onePixelPng);
        },
        upload: vi.fn(),
      });

      await expect(worker.runOne()).resolves.toEqual({
        status: 'retryable_failure',
        attemptId,
      });
      expect(disposition).toHaveBeenCalledTimes(1);
      expect(await readdir(root)).toEqual([]);
    },
  );

  it('does not accept broad database, Supabase, S3, user, or push-ingress credentials in worker options', async () => {
    const source = await readFile(new URL('../src/worker.ts', import.meta.url), 'utf8');
    expect(source).not.toMatch(/service.?role|publishable|supabase.?key|s3.?access|user.?jwt/i);
    expect(source).not.toMatch(/createServer|listen\(|\/v1\/scan|outputBase64/i);
  });
});
