import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { AttemptDeadline } from '../src/deadline.js';
import {
  createIsolatedImageSanitizer,
  type IsolatedSanitizerError,
} from '../src/isolated-sanitizer.js';
import { assertStaticImageStructure } from '../src/image-sanitizer.js';
import { onePixelPng } from './fixtures/v2-media.js';

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map(async (path) => rm(path, { recursive: true, force: true })),
  );
});

async function paths(): Promise<{ directory: string; inputPath: string; outputPath: string }> {
  const directory = await mkdtemp(join(tmpdir(), 'sallah-isolated-sanitizer-'));
  temporary.push(directory);
  const inputPath = join(directory, 'input.media');
  const outputPath = join(directory, 'output.media');
  await writeFile(inputPath, onePixelPng, { flag: 'wx', mode: 0o600 });
  return { directory, inputPath, outputPath };
}

function deadline(durationMs = 120_000): AttemptDeadline {
  return new AttemptDeadline({
    processingDeadline: new Date(Date.now() + durationMs).toISOString(),
  });
}

function processExists(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

describe('per-job native sanitizer process isolation', () => {
  it('runs one decode/re-encode job in a child and parent-verifies the exact output', async () => {
    const fixture = await paths();
    const jobDeadline = deadline();
    try {
      const result = await createIsolatedImageSanitizer()({
        inputPath: fixture.inputPath,
        outputPath: fixture.outputPath,
        purpose: 'request_media',
        declaredMimeType: 'image/png',
        deadline: jobDeadline,
      });

      expect(result).toMatchObject({
        detectedMimeType: 'image/png',
        sanitized: true,
        sanitizerId: 'decode-reencode-png-v1',
      });
      const output = Uint8Array.from(await readFile(fixture.outputPath));
      expect(output.byteLength).toBe(result.outputSize);
      expect(() => assertStaticImageStructure(output, 'image/png', { output: true })).not.toThrow();
    } finally {
      jobDeadline.dispose();
    }
  });

  it('kills an over-deadline child and removes any partial output', async () => {
    const fixture = await paths();
    const jobDeadline = deadline(250);
    const sanitize = createIsolatedImageSanitizer({
      childModuleUrl: new URL('../fixtures/hanging-sanitizer-child.mjs', import.meta.url),
    });
    const started = performance.now();
    try {
      await expect(
        sanitize({
          inputPath: fixture.inputPath,
          outputPath: fixture.outputPath,
          purpose: 'request_media',
          declaredMimeType: 'image/png',
          deadline: jobDeadline,
        }),
      ).rejects.toMatchObject({
        code: 'sanitizer_aborted',
      } satisfies Partial<IsolatedSanitizerError>);
      expect(performance.now() - started).toBeLessThan(2_000);
      await expect(readFile(fixture.outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      jobDeadline.dispose();
    }
  });

  it('kills an in-flight media-command grandchild when the parent deadline wins', async () => {
    const fixture = await paths();
    const markerPath = `${fixture.inputPath}.grandchild.pid`;
    const jobDeadline = deadline(500);
    const sanitize = createIsolatedImageSanitizer({
      childModuleUrl: new URL('../fixtures/media-grandchild-sanitizer-child.mjs', import.meta.url),
    });
    let grandchildPid: number | undefined;
    try {
      await expect(
        sanitize({
          inputPath: fixture.inputPath,
          outputPath: fixture.outputPath,
          purpose: 'request_media',
          declaredMimeType: 'image/png',
          deadline: jobDeadline,
        }),
      ).rejects.toMatchObject({ code: 'sanitizer_aborted' });
      grandchildPid = Number(await readFile(markerPath, 'utf8'));
      expect(Number.isSafeInteger(grandchildPid)).toBe(true);
      await new Promise((resolve) => setTimeout(resolve, 100));
      expect(processExists(grandchildPid)).toBe(false);
    } finally {
      jobDeadline.dispose();
      if (grandchildPid && processExists(grandchildPid)) {
        try {
          process.kill(-grandchildPid, 'SIGKILL');
        } catch {
          process.kill(grandchildPid, 'SIGKILL');
        }
      }
    }
  });

  it('bounds child control output and fails closed', async () => {
    const fixture = await paths();
    const jobDeadline = deadline();
    const sanitize = createIsolatedImageSanitizer({
      childModuleUrl: new URL('../fixtures/oversized-sanitizer-child.mjs', import.meta.url),
    });
    try {
      await expect(
        sanitize({
          inputPath: fixture.inputPath,
          outputPath: fixture.outputPath,
          purpose: 'request_media',
          declaredMimeType: 'image/png',
          deadline: jobDeadline,
        }),
      ).rejects.toMatchObject({
        code: 'sanitizer_control_oversized',
      } satisfies Partial<IsolatedSanitizerError>);
    } finally {
      jobDeadline.dispose();
    }
  });

  it('does not trust a self-consistent child result without strict parent output verification', async () => {
    const fixture = await paths();
    const jobDeadline = deadline();
    const sanitize = createIsolatedImageSanitizer({
      childModuleUrl: new URL('../fixtures/polyglot-sanitizer-child.mjs', import.meta.url),
    });
    try {
      await expect(
        sanitize({
          inputPath: fixture.inputPath,
          outputPath: fixture.outputPath,
          purpose: 'request_media',
          declaredMimeType: 'image/png',
          deadline: jobDeadline,
        }),
      ).rejects.toMatchObject({
        code: 'sanitizer_output_invalid',
      } satisfies Partial<IsolatedSanitizerError>);
      await expect(readFile(fixture.outputPath)).rejects.toMatchObject({ code: 'ENOENT' });
    } finally {
      jobDeadline.dispose();
    }
  });
});
