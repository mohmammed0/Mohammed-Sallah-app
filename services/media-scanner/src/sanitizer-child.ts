import { readFile, writeFile } from 'node:fs/promises';
import { isAbsolute } from 'node:path';

import { uploadMimeTypeSchema, uploadPurposeSchema } from './contracts.js';
import { AttemptDeadline } from './deadline.js';
import { createFfmpegRemuxer } from './ffmpeg-remux.js';
import { MediaPolicyError, sanitizeMedia } from './sanitize.js';

function extensionFor(mimeType: string): string {
  if (mimeType === 'image/jpeg') return 'jpg';
  if (mimeType === 'image/png') return 'png';
  if (mimeType === 'image/webp') return 'webp';
  if (mimeType === 'video/mp4') return 'mp4';
  if (mimeType === 'audio/mp4') return 'm4a';
  if (mimeType === 'audio/webm') return 'webm';
  return 'pdf';
}

async function main(): Promise<void> {
  const [inputPath, outputPath, purposeValue, mimeValue, processingDeadline, ...extra] =
    process.argv.slice(2);
  if (
    !inputPath ||
    !outputPath ||
    !purposeValue ||
    !mimeValue ||
    !processingDeadline ||
    extra.length !== 0 ||
    !isAbsolute(inputPath) ||
    !isAbsolute(outputPath) ||
    inputPath === outputPath
  ) {
    throw new Error('sanitizer_child_invalid_contract');
  }
  const purpose = uploadPurposeSchema.parse(purposeValue);
  const declaredMimeType = uploadMimeTypeSchema.parse(mimeValue);
  const deadline = new AttemptDeadline({ processingDeadline });
  try {
    if (declaredMimeType === 'audio/mp4' || declaredMimeType === 'video/mp4') {
      const result = await createFfmpegRemuxer()({
        inputPath,
        outputPath,
        purpose,
        declaredMimeType,
        deadline,
      });
      process.stdout.write(
        JSON.stringify({
          status: 'clean',
          detectedMimeType: result.detectedMimeType,
          sanitized: result.sanitized,
          sanitizerId: result.sanitizerId,
          sanitizerVersion: result.sanitizerVersion,
        }),
      );
      return;
    }
    const bytes = Uint8Array.from(await readFile(inputPath));
    deadline.assertActive();
    const result = await sanitizeMedia({
      bytes,
      purpose,
      declaredMimeType,
      extension: extensionFor(declaredMimeType),
      signal: deadline.signal,
    });
    deadline.assertActive();
    await writeFile(outputPath, result.bytes, { flag: 'wx', mode: 0o600 });
    process.stdout.write(
      JSON.stringify({
        status: 'clean',
        detectedMimeType: result.detectedMimeType,
        sanitized: result.sanitized,
        sanitizerId: result.sanitizerId,
        sanitizerVersion: result.sanitizerVersion,
      }),
    );
  } catch (error) {
    if (error instanceof MediaPolicyError) {
      process.stdout.write(JSON.stringify({ status: 'rejected', code: error.code }));
      return;
    }
    throw error;
  } finally {
    deadline.dispose();
  }
}

await main().catch(() => {
  process.stderr.write('sanitizer_child_failed\n');
  process.exitCode = 1;
});
