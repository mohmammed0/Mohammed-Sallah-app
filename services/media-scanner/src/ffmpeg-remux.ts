import { spawn, type ChildProcess } from 'node:child_process';
import { createHash } from 'node:crypto';
import { readFile, rm, stat } from 'node:fs/promises';

import { z } from 'zod';

import {
  MAX_UPLOAD_BYTES,
  SCANNER_SANITIZER_VERSION,
  type UploadMimeType,
  type UploadPurpose,
} from './contracts.js';
import type { AttemptDeadline } from './deadline.js';
import { assertAcceptedRemuxPolicy, detectMediaFamily, MediaPolicyError } from './media-policy.js';

export const FFMPEG_PATH = '/opt/sallah-media/bin/ffmpeg' as const;
export const FFPROBE_PATH = '/opt/sallah-media/bin/ffprobe' as const;
const MAX_STDOUT_BYTES = 64 * 1024;
const MAX_STDERR_BYTES = 64 * 1024;
const MAX_AUDIO_DURATION_SECONDS = 120;
const MAX_VIDEO_DURATION_SECONDS = 300;
const MAX_VIDEO_WIDTH = 3840;
const MAX_VIDEO_HEIGHT = 2160;

export type FfmpegRemuxErrorCode =
  | 'aborted'
  | 'command_failed'
  | 'control_output_invalid'
  | 'malformed_container'
  | 'output_invalid'
  | 'unsupported_stream';

export class FfmpegRemuxError extends Error {
  override readonly name = 'FfmpegRemuxError';

  constructor(readonly code: FfmpegRemuxErrorCode) {
    super(code);
  }
}

export interface BoundedMediaCommand {
  readonly executable: typeof FFMPEG_PATH | typeof FFPROBE_PATH;
  readonly args: readonly string[];
  readonly signal: AbortSignal;
  readonly shell: false;
  readonly maxStdoutBytes: number;
  readonly maxStderrBytes: number;
}

export interface BoundedMediaCommandResult {
  readonly stdout: string;
  readonly stderr: string;
}

export type BoundedMediaCommandRunner = (
  command: BoundedMediaCommand,
) => Promise<BoundedMediaCommandResult>;

const numberString = z.string().regex(/^\d+(?:\.\d+)?$/);
const streamSchema = z
  .object({
    index: z.number().int().nonnegative(),
    codec_type: z.enum(['audio', 'video', 'subtitle', 'data', 'attachment']),
    codec_name: z.string().min(1).max(40),
    width: z.number().int().positive().optional(),
    height: z.number().int().positive().optional(),
    duration: numberString.optional(),
    is_encrypted: z.union([z.number().int().min(0).max(1), z.enum(['0', '1'])]).optional(),
  })
  .passthrough();
const probeSchema = z
  .object({
    programs: z.array(z.unknown()).max(0).optional(),
    format: z
      .object({
        format_name: z.string().min(1).max(120),
        duration: numberString,
        size: z.string().regex(/^\d+$/),
      })
      .passthrough(),
    streams: z.array(streamSchema).min(1).max(2),
  })
  .strict();

type Probe = z.infer<typeof probeSchema>;

function fail(code: FfmpegRemuxErrorCode): FfmpegRemuxError {
  return new FfmpegRemuxError(code);
}

function terminateProcessTree(child: ChildProcess): void {
  const pid = child.pid;
  if (pid && process.platform !== 'win32') {
    try {
      process.kill(-pid, 'SIGKILL');
      return;
    } catch {
      // The process group may already have terminated.
    }
  }
  child.kill('SIGKILL');
}

export const runBoundedMediaCommand: BoundedMediaCommandRunner = async (command) =>
  await new Promise((resolve, reject) => {
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let terminal: FfmpegRemuxError | undefined;
    const child = spawn(command.executable, [...command.args], {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      // Remain inside the disposable sanitizer child's process group. The
      // worker parent can then kill the whole native subtree even if this
      // child's AbortSignal handler has not run yet at the hard deadline.
      detached: false,
    });
    const stop = (code: FfmpegRemuxErrorCode) => {
      terminal ??= fail(code);
      terminateProcessTree(child);
    };
    const onAbort = () => stop('aborted');
    command.signal.addEventListener('abort', onAbort, { once: true });
    if (command.signal.aborted) onAbort();
    child.stdout.on('data', (chunk: Buffer) => {
      if (stdout.byteLength + chunk.byteLength > command.maxStdoutBytes) {
        stop('control_output_invalid');
        return;
      }
      stdout = Buffer.concat([stdout, chunk]);
    });
    child.stderr.on('data', (chunk: Buffer) => {
      if (stderr.byteLength + chunk.byteLength > command.maxStderrBytes) {
        stop('control_output_invalid');
        return;
      }
      stderr = Buffer.concat([stderr, chunk]);
    });
    child.once('error', () => {
      terminal ??= fail('command_failed');
    });
    child.once('close', (code, signal) => {
      command.signal.removeEventListener('abort', onAbort);
      if (terminal) {
        reject(terminal);
        return;
      }
      if (code !== 0 || signal !== null) {
        reject(fail('command_failed'));
        return;
      }
      try {
        resolve({
          stdout: new TextDecoder('utf-8', { fatal: true }).decode(stdout),
          stderr: new TextDecoder('utf-8', { fatal: true }).decode(stderr),
        });
      } catch {
        reject(fail('control_output_invalid'));
      }
    });
  });

function uint32(bytes: Uint8Array, offset: number): number {
  return (
    bytes[offset]! * 0x1000000 +
    bytes[offset + 1]! * 0x10000 +
    bytes[offset + 2]! * 0x100 +
    bytes[offset + 3]!
  );
}

function boxType(bytes: Uint8Array, offset: number): string {
  return String.fromCharCode(
    bytes[offset]!,
    bytes[offset + 1]!,
    bytes[offset + 2]!,
    bytes[offset + 3]!,
  );
}

function assertBoundedMp4TopLevel(bytes: Uint8Array): void {
  if (bytes.byteLength < 24 || bytes.byteLength > MAX_UPLOAD_BYTES) {
    throw fail('malformed_container');
  }
  let offset = 0;
  const counts = new Map<string, number>();
  while (offset < bytes.byteLength) {
    if (bytes.byteLength - offset < 8) throw fail('malformed_container');
    const size = uint32(bytes, offset);
    const type = boxType(bytes, offset + 4);
    if (size < 8 || offset + size > bytes.byteLength) throw fail('malformed_container');
    if (!['ftyp', 'moov', 'mdat', 'free'].includes(type)) throw fail('malformed_container');
    if (type === 'free') {
      const payload = bytes.subarray(offset + 8, offset + size);
      const text = new TextDecoder('latin1').decode(payload).toLowerCase();
      if (
        text.includes('<script') ||
        text.includes('<svg') ||
        text.includes('%pdf-') ||
        text.includes('pk\u0003\u0004') ||
        text.startsWith('mz')
      ) {
        throw fail('malformed_container');
      }
    }
    counts.set(type, (counts.get(type) ?? 0) + 1);
    offset += size;
  }
  if (
    offset !== bytes.byteLength ||
    counts.get('ftyp') !== 1 ||
    counts.get('moov') !== 1 ||
    counts.get('mdat') !== 1
  ) {
    throw fail('malformed_container');
  }
}

function parseProbe(stdout: string): Probe {
  try {
    return probeSchema.parse(JSON.parse(stdout));
  } catch {
    throw fail('control_output_invalid');
  }
}

function durationSeconds(probe: Probe): number {
  const duration = Number(probe.format.duration);
  if (!Number.isFinite(duration) || duration <= 0) throw fail('unsupported_stream');
  return duration;
}

function assertProbePolicy(
  probe: Probe,
  mimeType: 'audio/mp4' | 'video/mp4',
  expectedSize: number,
): void {
  if (!probe.format.format_name.split(',').some((name) => ['mov', 'mp4', 'm4a'].includes(name))) {
    throw fail('malformed_container');
  }
  if (Number(probe.format.size) !== expectedSize) throw fail('malformed_container');
  const duration = durationSeconds(probe);
  const audio = probe.streams.filter((stream) => stream.codec_type === 'audio');
  const video = probe.streams.filter((stream) => stream.codec_type === 'video');
  if (probe.streams.some((stream) => !['audio', 'video'].includes(stream.codec_type))) {
    throw fail('unsupported_stream');
  }
  if (probe.streams.some((stream) => String(stream.is_encrypted ?? '0') !== '0')) {
    throw fail('unsupported_stream');
  }
  if (audio.some((stream) => stream.codec_name !== 'aac')) throw fail('unsupported_stream');
  if (mimeType === 'audio/mp4') {
    if (duration > MAX_AUDIO_DURATION_SECONDS || audio.length !== 1 || video.length !== 0) {
      throw fail('unsupported_stream');
    }
    return;
  }
  if (duration > MAX_VIDEO_DURATION_SECONDS || video.length !== 1 || audio.length > 1) {
    throw fail('unsupported_stream');
  }
  const track = video[0]!;
  if (
    track.codec_name !== 'h264' ||
    !track.width ||
    !track.height ||
    track.width > MAX_VIDEO_WIDTH ||
    track.height > MAX_VIDEO_HEIGHT ||
    track.width * track.height > MAX_VIDEO_WIDTH * MAX_VIDEO_HEIGHT
  ) {
    throw fail('unsupported_stream');
  }
}

async function probeFile(
  run: BoundedMediaCommandRunner,
  path: string,
  signal: AbortSignal,
): Promise<Probe> {
  const result = await run({
    executable: FFPROBE_PATH,
    args: [
      '-v',
      'error',
      '-protocol_whitelist',
      'file',
      '-show_entries',
      'format=format_name,duration,size:stream=index,codec_type,codec_name,width,height,duration,is_encrypted',
      '-of',
      'json',
      path,
    ],
    signal,
    shell: false,
    maxStdoutBytes: MAX_STDOUT_BYTES,
    maxStderrBytes: MAX_STDERR_BYTES,
  });
  return parseProbe(result.stdout);
}

export interface FfmpegRemuxInput {
  readonly inputPath: string;
  readonly outputPath: string;
  readonly purpose: UploadPurpose;
  readonly declaredMimeType: UploadMimeType;
  readonly deadline: AttemptDeadline;
}

export interface RemuxedMedia {
  readonly detectedMimeType: 'audio/mp4' | 'video/mp4';
  readonly sanitized: true;
  readonly sanitizerId: 'sallah.ffmpeg.remux.audio-mp4' | 'sallah.ffmpeg.remux.video-mp4';
  readonly sanitizerVersion: typeof SCANNER_SANITIZER_VERSION;
  readonly outputSize: number;
  readonly outputSha256: string;
}

export async function verifyRemuxedMediaOutput(
  outputPath: string,
  mimeType: 'audio/mp4' | 'video/mp4',
  signal: AbortSignal,
  run: BoundedMediaCommandRunner = runBoundedMediaCommand,
): Promise<{
  readonly outputSize: number;
  readonly outputSha256: string;
  readonly durationSeconds: number;
}> {
  const outputDetails = await stat(outputPath);
  if (!outputDetails.isFile() || outputDetails.size <= 0 || outputDetails.size > MAX_UPLOAD_BYTES) {
    throw fail('output_invalid');
  }
  const outputBytes = Uint8Array.from(await readFile(outputPath));
  assertBoundedMp4TopLevel(outputBytes);
  const outputProbe = await probeFile(run, outputPath, signal);
  assertProbePolicy(outputProbe, mimeType, outputBytes.byteLength);
  return {
    outputSize: outputBytes.byteLength,
    outputSha256: createHash('sha256').update(outputBytes).digest('hex'),
    durationSeconds: durationSeconds(outputProbe),
  };
}

export function createFfmpegRemuxer(
  options: { readonly run?: BoundedMediaCommandRunner } = {},
): (input: FfmpegRemuxInput) => Promise<RemuxedMedia> {
  const run = options.run ?? runBoundedMediaCommand;
  return async (input) => {
    input.deadline.assertActive();
    if (input.declaredMimeType !== 'audio/mp4' && input.declaredMimeType !== 'video/mp4') {
      throw new MediaPolicyError('unsupported_media');
    }
    try {
      const inputBytes = Uint8Array.from(await readFile(input.inputPath));
      const candidate = {
        bytes: inputBytes,
        purpose: input.purpose,
        declaredMimeType: input.declaredMimeType,
        extension: input.declaredMimeType === 'audio/mp4' ? 'm4a' : 'mp4',
        detectedFamily: detectMediaFamily(inputBytes),
        signal: input.deadline.signal,
      };
      assertAcceptedRemuxPolicy(candidate);
      assertBoundedMp4TopLevel(inputBytes);
      const inputProbe = await probeFile(run, input.inputPath, input.deadline.signal);
      assertProbePolicy(inputProbe, input.declaredMimeType, inputBytes.byteLength);
      input.deadline.assertActive();
      const maps =
        input.declaredMimeType === 'audio/mp4'
          ? ['-map', '0:a:0']
          : ['-map', '0:v:0', '-map', '0:a:0?'];
      const bitExactFlags =
        input.declaredMimeType === 'audio/mp4'
          ? ['-flags:a', '+bitexact']
          : ['-flags:v', '+bitexact', '-flags:a', '+bitexact'];
      await run({
        executable: FFMPEG_PATH,
        args: [
          '-v',
          'error',
          '-nostdin',
          '-xerror',
          '-err_detect',
          'explode',
          '-protocol_whitelist',
          'file',
          '-i',
          input.inputPath,
          ...maps,
          '-sn',
          '-dn',
          '-map_metadata',
          '-1',
          '-map_chapters',
          '-1',
          '-fflags',
          '+bitexact',
          ...bitExactFlags,
          '-c',
          'copy',
          '-movflags',
          '+faststart',
          '-fs',
          String(MAX_UPLOAD_BYTES),
          '-f',
          'mp4',
          '-n',
          input.outputPath,
        ],
        signal: input.deadline.signal,
        shell: false,
        maxStdoutBytes: MAX_STDOUT_BYTES,
        maxStderrBytes: MAX_STDERR_BYTES,
      });
      input.deadline.assertActive();
      const verified = await verifyRemuxedMediaOutput(
        input.outputPath,
        input.declaredMimeType,
        input.deadline.signal,
        run,
      );
      if (Math.abs(durationSeconds(inputProbe) - verified.durationSeconds) > 0.1) {
        throw fail('output_invalid');
      }
      return {
        detectedMimeType: input.declaredMimeType,
        sanitized: true,
        sanitizerId:
          input.declaredMimeType === 'audio/mp4'
            ? 'sallah.ffmpeg.remux.audio-mp4'
            : 'sallah.ffmpeg.remux.video-mp4',
        sanitizerVersion: SCANNER_SANITIZER_VERSION,
        outputSize: verified.outputSize,
        outputSha256: verified.outputSha256,
      };
    } catch (error) {
      await rm(input.outputPath, { force: true }).catch(() => undefined);
      throw error;
    }
  };
}
