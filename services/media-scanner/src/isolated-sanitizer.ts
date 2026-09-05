import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, rm, stat } from 'node:fs/promises';
import { isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import {
  acceptedMediaMimeTypeSchema,
  MAX_UPLOAD_BYTES,
  SCANNER_SANITIZER_VERSION,
  type UploadMimeType,
  type UploadPurpose,
} from './contracts.js';
import type { AttemptDeadline } from './deadline.js';
import { assertStaticImageStructure } from './image-sanitizer.js';
import { verifyRemuxedMediaOutput } from './ffmpeg-remux.js';

const MAX_CONTROL_STDOUT_BYTES = 8 * 1024;
const MAX_CONTROL_STDERR_BYTES = 16 * 1024;
const defaultChildModuleUrl = new URL('../dist/sanitizer-child.js', import.meta.url);

const cleanResultSchema = z
  .object({
    status: z.literal('clean'),
    detectedMimeType: acceptedMediaMimeTypeSchema,
    sanitized: z.literal(true),
    sanitizerId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
    sanitizerVersion: z.literal(SCANNER_SANITIZER_VERSION),
  })
  .strict();

const rejectedResultSchema = z
  .object({
    status: z.literal('rejected'),
    code: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
  })
  .strict();

const childResultSchema = z.discriminatedUnion('status', [cleanResultSchema, rejectedResultSchema]);

export type IsolatedSanitizerErrorCode =
  | 'sanitizer_aborted'
  | 'sanitizer_child_failed'
  | 'sanitizer_control_invalid'
  | 'sanitizer_control_oversized'
  | 'sanitizer_media_rejected'
  | 'sanitizer_output_invalid';

export class IsolatedSanitizerError extends Error {
  override readonly name = 'IsolatedSanitizerError';

  constructor(readonly code: IsolatedSanitizerErrorCode) {
    super(code);
  }
}

export interface IsolatedSanitizerInput {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly purpose: UploadPurpose;
  readonly declaredMimeType: UploadMimeType;
  readonly deadline: AttemptDeadline;
}

export interface VerifiedSanitizedMedia {
  readonly detectedMimeType: 'image/jpeg' | 'image/png' | 'image/webp' | 'audio/mp4' | 'video/mp4';
  readonly sanitized: true;
  readonly sanitizerId: string;
  readonly sanitizerVersion: typeof SCANNER_SANITIZER_VERSION;
  readonly outputSize: number;
  readonly outputSha256: string;
}

export type IsolatedImageSanitizer = (
  input: IsolatedSanitizerInput,
) => Promise<VerifiedSanitizedMedia>;

export interface IsolatedImageSanitizerOptions {
  /** Test-only fault-injection seam. Production uses the package-local compiled child module. */
  readonly childModuleUrl?: URL;
}

function fail(code: IsolatedSanitizerErrorCode): IsolatedSanitizerError {
  return new IsolatedSanitizerError(code);
}

function terminateProcessTree(child: ChildProcess): void {
  const pid = child.pid;
  if (pid && process.platform !== 'win32') {
    try {
      process.kill(-pid, 'SIGKILL');
      return;
    } catch {
      // Fall back to the direct child if the process group already exited.
    }
  }
  child.kill('SIGKILL');
}

async function runChild(
  childModulePath: string,
  input: IsolatedSanitizerInput,
): Promise<z.infer<typeof childResultSchema>> {
  return await new Promise((resolve, reject) => {
    let terminalError: IsolatedSanitizerError | undefined;
    let stdout = Buffer.alloc(0);
    let stderrBytes = 0;
    const child = spawn(
      process.execPath,
      [
        childModulePath,
        input.inputPath,
        input.outputPath,
        input.purpose,
        input.declaredMimeType,
        input.deadline.processingDeadline,
      ],
      {
        shell: false,
        stdio: ['ignore', 'pipe', 'pipe'],
        windowsHide: true,
        detached: process.platform !== 'win32',
      },
    );

    const stop = (code: IsolatedSanitizerErrorCode): void => {
      terminalError ??= fail(code);
      terminateProcessTree(child);
    };
    const onAbort = (): void => stop('sanitizer_aborted');
    input.deadline.signal.addEventListener('abort', onAbort, { once: true });
    if (input.deadline.signal.aborted) onAbort();

    child.stdout.on('data', (chunk: Buffer) => {
      if (terminalError) return;
      if (stdout.byteLength + chunk.byteLength > MAX_CONTROL_STDOUT_BYTES) {
        stop('sanitizer_control_oversized');
        return;
      }
      stdout = Buffer.concat([stdout, chunk], stdout.byteLength + chunk.byteLength);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (terminalError) return;
      stderrBytes += chunk.byteLength;
      if (stderrBytes > MAX_CONTROL_STDERR_BYTES) stop('sanitizer_control_oversized');
    });
    child.once('error', () => {
      terminalError ??= fail('sanitizer_child_failed');
    });
    child.once('close', (code, signal) => {
      input.deadline.signal.removeEventListener('abort', onAbort);
      if (terminalError) {
        reject(terminalError);
        return;
      }
      if (code !== 0 || signal !== null) {
        reject(fail('sanitizer_child_failed'));
        return;
      }
      try {
        const parsed = childResultSchema.safeParse(
          JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(stdout)),
        );
        if (!parsed.success) throw fail('sanitizer_control_invalid');
        resolve(parsed.data);
      } catch (error) {
        reject(error instanceof IsolatedSanitizerError ? error : fail('sanitizer_control_invalid'));
      }
    });
  });
}

async function verifyOutput(
  outputPath: string,
  declaredMimeType: UploadMimeType,
  childResult: z.infer<typeof cleanResultSchema>,
  signal: AbortSignal,
): Promise<VerifiedSanitizedMedia> {
  if (childResult.detectedMimeType !== declaredMimeType) throw fail('sanitizer_output_invalid');
  const details = await stat(outputPath);
  if (!details.isFile() || details.size <= 0 || details.size > MAX_UPLOAD_BYTES) {
    throw fail('sanitizer_output_invalid');
  }
  let outputSize: number;
  let outputSha256: string;
  if (
    childResult.detectedMimeType === 'audio/mp4' ||
    childResult.detectedMimeType === 'video/mp4'
  ) {
    try {
      const verified = await verifyRemuxedMediaOutput(
        outputPath,
        childResult.detectedMimeType,
        signal,
      );
      outputSize = verified.outputSize;
      outputSha256 = verified.outputSha256;
    } catch {
      throw fail('sanitizer_output_invalid');
    }
  } else {
    const bytes = Uint8Array.from(await readFile(outputPath));
    if (bytes.byteLength !== details.size) throw fail('sanitizer_output_invalid');
    try {
      assertStaticImageStructure(bytes, childResult.detectedMimeType, { output: true });
    } catch {
      throw fail('sanitizer_output_invalid');
    }
    outputSize = bytes.byteLength;
    outputSha256 = createHash('sha256').update(bytes).digest('hex');
  }
  return {
    detectedMimeType: childResult.detectedMimeType,
    sanitized: true,
    sanitizerId: childResult.sanitizerId,
    sanitizerVersion: childResult.sanitizerVersion,
    outputSize,
    outputSha256,
  };
}

export function createIsolatedImageSanitizer(
  options: IsolatedImageSanitizerOptions = {},
): IsolatedImageSanitizer {
  const moduleUrl = options.childModuleUrl ?? defaultChildModuleUrl;
  if (moduleUrl.protocol !== 'file:') throw fail('sanitizer_child_failed');
  const childModulePath = fileURLToPath(moduleUrl);

  return async (input) => {
    if (!isAbsolute(input.inputPath) || !isAbsolute(input.outputPath)) {
      throw fail('sanitizer_child_failed');
    }
    input.deadline.assertActive();
    try {
      const result = await runChild(childModulePath, input);
      input.deadline.assertActive();
      if (result.status === 'rejected') throw fail('sanitizer_media_rejected');
      return await verifyOutput(
        input.outputPath,
        input.declaredMimeType,
        result,
        input.deadline.signal,
      );
    } catch (error) {
      await rm(input.outputPath, { force: true }).catch(() => undefined);
      throw error;
    }
  };
}
