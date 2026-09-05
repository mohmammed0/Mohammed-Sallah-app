import { spawn } from 'node:child_process';
import { appendFile, mkdir, readFile, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

import { AttemptDeadline } from './dist/deadline.js';
import {
  createFfmpegRemuxer,
  FfmpegRemuxError,
  FFMPEG_PATH,
  FFPROBE_PATH,
  runBoundedMediaCommand,
} from './dist/ffmpeg-remux.js';

const root = '/tmp/scanner/remux-probe';
const evidence = [];

function run(executable, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, {
      shell: false,
      stdio: ['ignore', 'pipe', 'pipe'],
      detached: true,
    });
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    const append = (current, chunk) => {
      const next = Buffer.concat([current, chunk]);
      if (next.byteLength > 64 * 1024) {
        process.kill(-child.pid, 'SIGKILL');
        throw new Error('probe_output_too_large');
      }
      return next;
    };
    child.stdout.on('data', (chunk) => {
      stdout = append(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = append(stderr, chunk);
    });
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (code !== 0 || signal !== null) {
        reject(new Error(`probe_command_failed:${code}:${signal}:${stderr.toString('utf8')}`));
        return;
      }
      resolve(stdout.toString('utf8'));
    });
  });
}

async function generateAudio(path, format) {
  await run(FFMPEG_PATH, [
    '-v',
    'error',
    '-nostdin',
    '-f',
    'lavfi',
    '-i',
    'sine=frequency=440:duration=1',
    '-c:a',
    'aac',
    '-b:a',
    '64k',
    '-metadata',
    'title=SallahPrivateProbe',
    '-f',
    format,
    '-y',
    path,
  ]);
}

async function generateVideo(path) {
  await run(FFMPEG_PATH, [
    '-v',
    'error',
    '-nostdin',
    '-f',
    'lavfi',
    '-i',
    'color=c=black:s=32x32:d=1',
    '-f',
    'lavfi',
    '-i',
    'anullsrc=r=48000:cl=stereo',
    '-shortest',
    '-c:v',
    'libx264',
    '-pix_fmt',
    'yuv420p',
    '-c:a',
    'aac',
    '-metadata',
    'title=SallahPrivateProbe',
    '-f',
    'mp4',
    '-y',
    path,
  ]);
}

async function probe(path) {
  return JSON.parse(
    await run(FFPROBE_PATH, [
      '-v',
      'error',
      '-protocol_whitelist',
      'file',
      '-show_entries',
      'format=format_name,duration,size:format_tags:stream=index,codec_type,codec_name,width,height',
      '-of',
      'json',
      path,
    ]),
  );
}

async function remux(label, inputPath, outputPath, purpose, declaredMimeType) {
  const deadline = new AttemptDeadline({
    processingDeadline: new Date(Date.now() + 60_000).toISOString(),
  });
  try {
    const result = await createFfmpegRemuxer()({
      inputPath,
      outputPath,
      purpose,
      declaredMimeType,
      deadline,
    });
    const outputProbe = await probe(outputPath);
    if (
      outputProbe.format?.tags &&
      Object.keys(outputProbe.format.tags).some(
        (key) => !['compatible_brands', 'major_brand', 'minor_version'].includes(key),
      )
    ) {
      throw new Error('remux_metadata_retained');
    }
    evidence.push(label, 'remux-metadata-stripped');
    return result;
  } finally {
    deadline.dispose();
  }
}

async function ffmpegProcessIds() {
  const entries = await readdir('/proc');
  const found = [];
  for (const entry of entries) {
    if (!/^\d+$/u.test(entry)) continue;
    try {
      const command = await readFile(`/proc/${entry}/cmdline`, 'utf8');
      if (command.includes('/opt/sallah-media/bin/ffmpeg')) found.push(Number(entry));
    } catch {
      // The short-lived process may exit between /proc enumeration and inspection.
    }
  }
  return found;
}

await rm(root, { recursive: true, force: true });
await mkdir(root, { recursive: true, mode: 0o700 });
try {
  const m4a = join(root, 'input.m4a');
  await generateAudio(m4a, 'ipod');
  await remux('real-m4a-remux', m4a, join(root, 'output-m4a.mp4'), 'request_audio', 'audio/mp4');

  const audioMp4 = join(root, 'input-audio.mp4');
  await generateAudio(audioMp4, 'mp4');
  await remux(
    'real-mp4-audio-remux',
    audioMp4,
    join(root, 'output-audio.mp4'),
    'request_audio',
    'audio/mp4',
  );

  const video = join(root, 'input-video.mp4');
  await generateVideo(video);
  await remux(
    'real-mp4-video-remux',
    video,
    join(root, 'output-video.mp4'),
    'completion_proof',
    'video/mp4',
  );

  const polyglot = join(root, 'input-polyglot.mp4');
  await generateVideo(polyglot);
  await appendFile(polyglot, '<script>alert(1)</script>PK\u0003\u0004');
  const deadline = new AttemptDeadline({
    processingDeadline: new Date(Date.now() + 30_000).toISOString(),
  });
  try {
    await createFfmpegRemuxer()({
      inputPath: polyglot,
      outputPath: join(root, 'output-polyglot.mp4'),
      purpose: 'completion_proof',
      declaredMimeType: 'video/mp4',
      deadline,
    });
    throw new Error('trailing_payload_accepted');
  } catch (error) {
    if (!(error instanceof FfmpegRemuxError) || error.code !== 'malformed_container') throw error;
    evidence.push('remux-trailing-payload-rejected');
  } finally {
    deadline.dispose();
  }

  const timeoutController = new AbortController();
  const timeout = setTimeout(() => timeoutController.abort(), 150);
  try {
    await runBoundedMediaCommand({
      executable: FFMPEG_PATH,
      args: [
        '-v',
        'error',
        '-nostdin',
        '-re',
        '-f',
        'lavfi',
        '-i',
        'anullsrc=r=48000:cl=stereo',
        '-t',
        '60',
        '-f',
        'null',
        '-',
      ],
      signal: timeoutController.signal,
      shell: false,
      maxStdoutBytes: 64 * 1024,
      maxStderrBytes: 64 * 1024,
    });
    throw new Error('remux_timeout_not_enforced');
  } catch (error) {
    if (!(error instanceof FfmpegRemuxError) || error.code !== 'aborted') throw error;
    await new Promise((resolve) => setTimeout(resolve, 100));
    if ((await ffmpegProcessIds()).length !== 0) throw new Error('remux_child_residue');
    evidence.push('remux-timeout-child-killed');
  } finally {
    clearTimeout(timeout);
  }

  const version = (await run(FFMPEG_PATH, ['-version'])).split('\n')[0];
  const license = await run(FFMPEG_PATH, ['-L']);
  const files = await Promise.all([
    readFile(join(root, 'output-m4a.mp4')),
    readFile(join(root, 'output-audio.mp4')),
    readFile(join(root, 'output-video.mp4')),
  ]);
  console.log(
    JSON.stringify({
      status: 'pass',
      evidence: [...new Set(evidence)].sort(),
      version,
      license: license.includes('GNU General Public License') ? 'GPL' : 'UNKNOWN',
      outputBytes: files.map((file) => file.byteLength),
    }),
  );
} finally {
  await rm(root, { recursive: true, force: true });
}
