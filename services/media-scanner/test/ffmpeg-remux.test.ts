import { mkdtemp, readFile, rm, truncate, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import { AttemptDeadline } from '../src/deadline.js';
import {
  createFfmpegRemuxer,
  type BoundedMediaCommand,
  verifyRemuxedMediaOutput,
} from '../src/ffmpeg-remux.js';

const temporary: string[] = [];
const minimalMp4 = Buffer.from(
  '00000018667479704d344120000000004d34412069736f6d000000086d6f6f76000000086d646174',
  'hex',
);

afterEach(async () => {
  await Promise.all(temporary.splice(0).map((path) => rm(path, { recursive: true, force: true })));
});

function probe(kind: 'audio' | 'video', size: number) {
  const streams =
    kind === 'audio'
      ? [{ index: 0, codec_type: 'audio', codec_name: 'aac', duration: '2.000000' }]
      : [
          {
            index: 0,
            codec_type: 'video',
            codec_name: 'h264',
            width: 16,
            height: 16,
            duration: '2.000000',
          },
          { index: 1, codec_type: 'audio', codec_name: 'aac', duration: '2.000000' },
        ];
  return JSON.stringify({
    format: { format_name: 'mov,mp4,m4a,3gp,3g2,mj2', duration: '2.000000', size: String(size) },
    streams,
  });
}

describe('bounded ffmpeg/ffprobe MP4-family remux', () => {
  it.each([
    ['audio/mp4', 'request_audio', 'sallah.ffmpeg.remux.audio-mp4', 'audio'],
    ['video/mp4', 'completion_proof', 'sallah.ffmpeg.remux.video-mp4', 'video'],
  ] as const)(
    'uses fixed no-shell argv and reopens %s output',
    async (mime, purpose, sanitizerId, kind) => {
      const directory = await mkdtemp(join(tmpdir(), 'sallah-remux-'));
      temporary.push(directory);
      const inputPath = join(directory, `input.${kind === 'audio' ? 'm4a' : 'mp4'}`);
      const outputPath = join(directory, `output.${kind === 'audio' ? 'm4a' : 'mp4'}`);
      const inputBytes = minimalMp4;
      await writeFile(inputPath, inputBytes);
      const commands: BoundedMediaCommand[] = [];
      const run = vi.fn(async (command: BoundedMediaCommand) => {
        commands.push(command);
        expect(command.shell).toBe(false);
        expect(command.args).toContain('-protocol_whitelist');
        expect(command.args).toContain('file');
        if (command.executable === '/opt/sallah-media/bin/ffprobe') {
          expect(command.args).not.toContain('-nostdin');
          const target = command.args.at(-1);
          const size =
            target === outputPath ? (await readFile(outputPath)).byteLength : inputBytes.byteLength;
          return { stdout: probe(kind, size), stderr: '' };
        }
        expect(command.executable).toBe('/opt/sallah-media/bin/ffmpeg');
        expect(command.args).toContain('-nostdin');
        expect(command.args).toEqual(
          expect.arrayContaining([
            '-map_metadata',
            '-1',
            '-map_chapters',
            '-1',
            '-fflags',
            '+bitexact',
            '-c',
            'copy',
            '-movflags',
            '+faststart',
            '-fs',
            String(20 * 1024 * 1024),
          ]),
        );
        await writeFile(outputPath, inputBytes, { flag: 'wx', mode: 0o600 });
        return { stdout: '', stderr: '' };
      });
      const remux = createFfmpegRemuxer({ run });
      const deadline = new AttemptDeadline({
        processingDeadline: new Date(Date.now() + 120_000).toISOString(),
      });

      await expect(
        remux({ inputPath, outputPath, purpose, declaredMimeType: mime, deadline }),
      ).resolves.toMatchObject({
        detectedMimeType: mime,
        sanitized: true,
        sanitizerId,
        outputSize: inputBytes.byteLength,
      });
      expect(commands.map((command) => command.executable)).toEqual([
        '/opt/sallah-media/bin/ffprobe',
        '/opt/sallah-media/bin/ffmpeg',
        '/opt/sallah-media/bin/ffprobe',
      ]);
      deadline.dispose();
    },
  );

  it('rejects unsupported streams before invoking ffmpeg', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sallah-remux-'));
    temporary.push(directory);
    const inputPath = join(directory, 'input.m4a');
    const outputPath = join(directory, 'output.m4a');
    await writeFile(inputPath, minimalMp4);
    const run = vi.fn(() =>
      Promise.resolve({
        stdout: JSON.stringify({
          format: {
            format_name: 'mov,mp4,m4a,3gp,3g2,mj2',
            duration: '2',
            size: String(minimalMp4.byteLength),
          },
          streams: [{ index: 0, codec_type: 'audio', codec_name: 'mp3', duration: '2' }],
        }),
        stderr: '',
      }),
    );
    const deadline = new AttemptDeadline({
      processingDeadline: new Date(Date.now() + 120_000).toISOString(),
    });

    await expect(
      createFfmpegRemuxer({ run })({
        inputPath,
        outputPath,
        purpose: 'request_audio',
        declaredMimeType: 'audio/mp4',
        deadline,
      }),
    ).rejects.toMatchObject({ code: 'unsupported_stream' });
    expect(run).toHaveBeenCalledTimes(1);
    deadline.dispose();
  });

  it('rejects malformed and oversized output before accepting ffprobe metadata', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sallah-remux-output-'));
    temporary.push(directory);
    const malformed = join(directory, 'malformed.mp4');
    const oversized = join(directory, 'oversized.mp4');
    await writeFile(malformed, Buffer.from('not-an-mp4'));
    await writeFile(oversized, minimalMp4);
    await truncate(oversized, 20 * 1024 * 1024 + 1);
    const signal = new AbortController().signal;

    await expect(verifyRemuxedMediaOutput(malformed, 'video/mp4', signal)).rejects.toMatchObject({
      code: 'malformed_container',
    });
    await expect(verifyRemuxedMediaOutput(oversized, 'video/mp4', signal)).rejects.toMatchObject({
      code: 'output_invalid',
    });
  });

  it.each([
    [
      'audio duration',
      'audio/mp4',
      'request_audio',
      {
        format: { format_name: 'mov,mp4,m4a', duration: '121', size: String(minimalMp4.length) },
        streams: [{ index: 0, codec_type: 'audio', codec_name: 'aac' }],
      },
    ],
    [
      'video dimensions',
      'video/mp4',
      'completion_proof',
      {
        format: { format_name: 'mov,mp4', duration: '2', size: String(minimalMp4.length) },
        streams: [{ index: 0, codec_type: 'video', codec_name: 'h264', width: 3841, height: 16 }],
      },
    ],
    [
      'extra stream',
      'video/mp4',
      'completion_proof',
      {
        format: { format_name: 'mov,mp4', duration: '2', size: String(minimalMp4.length) },
        streams: [
          { index: 0, codec_type: 'video', codec_name: 'h264', width: 16, height: 16 },
          { index: 1, codec_type: 'audio', codec_name: 'aac' },
          { index: 2, codec_type: 'subtitle', codec_name: 'mov_text' },
        ],
      },
    ],
    [
      'encrypted stream',
      'audio/mp4',
      'request_audio',
      {
        format: { format_name: 'mov,mp4,m4a', duration: '2', size: String(minimalMp4.length) },
        streams: [{ index: 0, codec_type: 'audio', codec_name: 'aac', is_encrypted: 1 }],
      },
    ],
    [
      'unsupported video codec',
      'video/mp4',
      'completion_proof',
      {
        format: { format_name: 'mov,mp4', duration: '2', size: String(minimalMp4.length) },
        streams: [{ index: 0, codec_type: 'video', codec_name: 'hevc', width: 16, height: 16 }],
      },
    ],
  ] as const)('rejects %s before remuxing', async (_label, mime, purpose, probeResult) => {
    const directory = await mkdtemp(join(tmpdir(), 'sallah-remux-policy-'));
    temporary.push(directory);
    const inputPath = join(directory, 'input.mp4');
    const outputPath = join(directory, 'output.mp4');
    await writeFile(inputPath, minimalMp4);
    const run = vi.fn(() => Promise.resolve({ stdout: JSON.stringify(probeResult), stderr: '' }));
    const deadline = new AttemptDeadline({
      processingDeadline: new Date(Date.now() + 120_000).toISOString(),
    });
    const result = createFfmpegRemuxer({ run })({
      inputPath,
      outputPath,
      purpose,
      declaredMimeType: mime,
      deadline,
    });
    await expect(result).rejects.toSatisfy((error: unknown) => {
      if (typeof error !== 'object' || error === null || !('code' in error)) return false;
      return /unsupported_stream|control_output_invalid/.test(String(error.code));
    });
    expect(run).toHaveBeenCalledTimes(1);
    deadline.dispose();
  });
});
