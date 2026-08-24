import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { AttemptDeadline } from '../src/deadline.js';
import { createScannerPipeline, type ScannerPipelineError } from '../src/pipeline.js';
import { onePixelPng } from './fixtures/v2-media.js';

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map(async (path) => rm(path, { recursive: true, force: true })),
  );
});

function deadline(): AttemptDeadline {
  return new AttemptDeadline({ processingDeadline: new Date(Date.now() + 120_000).toISOString() });
}

describe('file-based two-scan pipeline', () => {
  it('scans original, sanitizes, reopens, and scans final in that order', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sallah-pipeline-'));
    temporary.push(directory);
    const inputPath = join(directory, 'input');
    const outputPath = join(directory, 'output');
    await writeFile(inputPath, onePixelPng);
    const calls: string[] = [];
    const scanner = {
      scanFile: vi.fn(async (path: string) => {
        await Promise.resolve();
        calls.push(path === inputPath ? 'original_scan' : 'final_scan');
        return {
          verdict: 'clean' as const,
          engineVersion: '1.4.3',
          signatureVersion: '28000',
          signatureTimestamp: '2026-08-21T12:00:00.000Z',
          signatureAgeSeconds: 60,
        };
      }),
    };
    const pipeline = createScannerPipeline({ malwareScanner: scanner });
    const result = await pipeline.process({
      inputPath,
      outputPath,
      purpose: 'request_media',
      declaredMimeType: 'image/png',
      deadline: deadline(),
    });

    expect(calls).toEqual(['original_scan', 'final_scan']);
    expect(result).toMatchObject({
      detectedInputMime: 'image/png',
      detectedOutputMime: 'image/png',
      sanitized: true,
      originalScan: 'clean',
      finalScan: 'clean',
    });
    expect((await readFile(outputPath)).byteLength).toBeGreaterThan(0);
  });

  it('fails terminally when the final ClamAV scan detects sanitized output', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sallah-pipeline-'));
    temporary.push(directory);
    const inputPath = join(directory, 'input');
    const outputPath = join(directory, 'output');
    await writeFile(inputPath, onePixelPng);
    let scans = 0;
    const scanner = {
      scanFile: vi.fn(() => {
        scans += 1;
        const evidence = {
          engineVersion: '1.4.3',
          signatureVersion: '28000',
          signatureTimestamp: '2026-08-21T12:00:00.000Z',
          signatureAgeSeconds: 60,
        };
        return Promise.resolve(
          scans === 1
            ? { verdict: 'clean' as const, ...evidence }
            : { verdict: 'malicious' as const, detectedSignature: 'Final-Test', ...evidence },
        );
      }),
    };
    const sanitizer = vi.fn(async () => {
      await writeFile(outputPath, onePixelPng);
      return {
        detectedMimeType: 'image/png' as const,
        sanitized: true as const,
        sanitizerId: 'decode-reencode-png-v1' as const,
        sanitizerVersion: '1.0.0' as const,
        outputSize: onePixelPng.byteLength,
        outputSha256: 'a'.repeat(64),
      };
    });
    const pipeline = createScannerPipeline({ malwareScanner: scanner, sanitizer });

    await expect(
      pipeline.process({
        inputPath,
        outputPath,
        purpose: 'request_media',
        declaredMimeType: 'image/png',
        deadline: deadline(),
      }),
    ).rejects.toMatchObject({ code: 'malware_detected' });
    expect(scanner.scanFile).toHaveBeenCalledTimes(2);
  });

  it('permits exactly one active media job per worker', async () => {
    let release: (() => void) | undefined;
    const blocked = new Promise<void>((resolve) => {
      release = resolve;
    });
    const scanner = {
      scanFile: vi.fn(async () => {
        await blocked;
        return {
          verdict: 'clean' as const,
          engineVersion: '1.4.3',
          signatureVersion: '28000',
          signatureTimestamp: '2026-08-21T12:00:00.000Z',
          signatureAgeSeconds: 60,
        };
      }),
    };
    const directory = await mkdtemp(join(tmpdir(), 'sallah-pipeline-'));
    temporary.push(directory);
    const inputPath = join(directory, 'input');
    await writeFile(inputPath, onePixelPng);
    const pipeline = createScannerPipeline({ malwareScanner: scanner });
    const first = pipeline.process({
      inputPath,
      outputPath: join(directory, 'one'),
      purpose: 'request_media',
      declaredMimeType: 'image/png',
      deadline: deadline(),
    });
    await vi.waitFor(() => expect(scanner.scanFile).toHaveBeenCalledTimes(1));
    await expect(
      pipeline.process({
        inputPath,
        outputPath: join(directory, 'two'),
        purpose: 'request_media',
        declaredMimeType: 'image/png',
        deadline: deadline(),
      }),
    ).rejects.toMatchObject({ code: 'scanner_busy' } satisfies Partial<ScannerPipelineError>);
    release?.();
    await first;
  });
});
