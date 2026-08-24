import { spawn } from 'node:child_process';
import { readFile, readdir, rm, stat, writeFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import { setTimeout as delay } from 'node:timers/promises';

import {
  AttemptDeadline,
  ClamdClient,
  ClamdClientError,
  MAX_UPLOAD_BYTES,
  createScannerPipeline,
  parseClamdVersionEvidence,
} from './dist/index.js';

const EICAR = Buffer.from(
  ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR', '-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join(''),
  'ascii',
);
const root = '/tmp/scanner/container-probe';
const MAX_PIXEL_WIDTH = 8_192;
const MAX_PIXEL_HEIGHT = 4_882;
const MAX_PIXEL_COUNT = MAX_PIXEL_WIDTH * MAX_PIXEL_HEIGHT;
const MAX_UPLOAD_MIB = 20 * 1024 * 1024;
const SEQUENTIAL_WEBP_JOB_COUNT = 3;
const WORKER_ACCEPTANCE_PEAK_BYTES = 768 * 1024 * 1024;
const PARENT_ACCEPTANCE_PEAK_BYTES = 192 * 1024 * 1024;

const imageCases = {
  'near-max-pixels-jpeg': {
    extension: 'jpg',
    mimeType: 'image/jpeg',
    encode: async (transformer) => await transformer.jpeg(90),
  },
  'near-max-pixels-png': {
    extension: 'png',
    mimeType: 'image/png',
    encode: async (transformer) => await transformer.png(),
  },
  'near-max-pixels-webp': {
    extension: 'webp',
    mimeType: 'image/webp',
    encode: async (transformer) => await transformer.webp(90),
  },
};

function client(now = undefined, maxAgeSeconds = 168 * 60 * 60) {
  return new ClamdClient({
    host: 'clamd',
    port: 3310,
    maxBytes: MAX_UPLOAD_BYTES,
    chunkBytes: 64 * 1024,
    connectTimeoutMs: 2_000,
    responseTimeoutMs: 120_000,
    signatureMaxAgeSeconds: maxAgeSeconds,
    ...(now ? { now } : {}),
  });
}

async function cgroupNumber(path) {
  const raw = (await readFile(path, 'utf8')).trim();
  return raw === 'max' ? null : Number(raw);
}

async function cgroupEvents() {
  const entries = Object.fromEntries(
    (await readFile('/sys/fs/cgroup/memory.events', 'utf8'))
      .trim()
      .split(/\r?\n/u)
      .map((line) => line.split(/\s+/u)),
  );
  return {
    oom: Number(entries.oom ?? 0),
    oomKill: Number(entries.oom_kill ?? 0),
  };
}

async function rssBytes(pid) {
  try {
    const status = await readFile(`/proc/${pid}/status`, 'utf8');
    const match = /^VmRSS:\s+(\d+) kB$/mu.exec(status);
    return match ? Number(match[1]) * 1024 : 0;
  } catch {
    return 0;
  }
}

async function directChildren() {
  const value = await readFile(`/proc/self/task/${process.pid}/children`, 'utf8');
  return value.trim().split(/\s+/u).filter(Boolean).map(Number);
}

function startMemoryMonitor() {
  const sample = {
    parentPeakRss: process.memoryUsage().rss,
    childPeakRss: 0,
    cgroupObservedPeak: 0,
    childPids: new Set(),
  };
  let running = true;
  const done = (async () => {
    while (running) {
      sample.parentPeakRss = Math.max(sample.parentPeakRss, process.memoryUsage().rss);
      sample.cgroupObservedPeak = Math.max(
        sample.cgroupObservedPeak,
        (await cgroupNumber('/sys/fs/cgroup/memory.current')) ?? 0,
      );
      for (const pid of await directChildren()) {
        sample.childPids.add(pid);
        sample.childPeakRss = Math.max(sample.childPeakRss, await rssBytes(pid));
      }
      await delay(20);
    }
  })();
  return {
    sample,
    async stop() {
      running = false;
      await done;
    },
  };
}

async function runFixtureGenerator(label, path) {
  const child = spawn(process.execPath, [process.argv[1], 'generate-fixture', label, path], {
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  });
  let stdout = '';
  let stderrBytes = 0;
  child.stdout.on('data', (chunk) => {
    stdout = `${stdout}${String(chunk)}`;
    if (Buffer.byteLength(stdout) > 8 * 1024) child.kill('SIGKILL');
  });
  child.stderr.on('data', (chunk) => {
    stderrBytes += chunk.byteLength;
    if (stderrBytes > 8 * 1024) child.kill('SIGKILL');
  });
  const code = await new Promise((resolve, reject) => {
    child.once('error', reject);
    child.once('close', resolve);
  });
  if (code !== 0) throw new Error('fixture generator failed');
  return JSON.parse(stdout);
}

async function realEicar() {
  const path = `${root}-eicar`;
  await writeFile(path, EICAR, { flag: 'wx', mode: 0o600 });
  try {
    const result = await client().scanFile(path);
    if (result.verdict !== 'malicious' || result.detectedSignature !== 'Eicar-Test-Signature') {
      throw new Error('real-eicar failed');
    }
    return result;
  } finally {
    await rm(path, { force: true });
  }
}

async function staleSignature() {
  const fresh = await client().readiness();
  const future = new Date(new Date(fresh.signatureTimestamp).getTime() + 169 * 60 * 60 * 1_000);
  try {
    await client(() => future).readiness();
  } catch (error) {
    if (error instanceof ClamdClientError && error.code === 'signature_stale') return;
    throw error;
  }
  throw new Error('stale-signature accepted');
}

function syntheticSignatureDenials() {
  const at = new Date('2026-08-22T12:00:00.000Z');
  const cases = [
    ['missing-signature', 'ClamAV 1.4.6//Sat Aug 22 11:00:00 2026', 'signature_unparseable'],
    ['unparseable-signature', 'ClamAV 1.4.6/28000/reloading', 'signature_unparseable'],
    ['future-signature', 'ClamAV 1.4.6/28000/Sat Aug 22 12:00:01 2026', 'signature_future'],
    ['reload-window', 'RELOADING', 'signature_unparseable'],
  ];
  for (const [label, evidence, expected] of cases) {
    try {
      parseClamdVersionEvidence(evidence, at, 3_600);
    } catch (error) {
      if (error instanceof ClamdClientError && error.code === expected) continue;
      throw error;
    }
    throw new Error(`${label} accepted`);
  }
}

async function nearMaxBytePng() {
  const { Transformer } = await import('@napi-rs/image');
  const width = 2_200;
  const height = 2_200;
  const pixels = new Uint8Array(width * height * 4);
  let state = 0x9e37_79b9;
  for (let index = 0; index < pixels.byteLength; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    pixels[index] = state & 0xff;
  }
  const encoded = Uint8Array.from(await Transformer.fromRgbaPixels(pixels, width, height).png());
  if (encoded.byteLength <= 18 * 1024 * 1024 || encoded.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error('max-image fixture outside accepted range');
  }
  return { encoded, height, label: 'near-max-bytes-png', mimeType: 'image/png', width };
}

async function nearMaxPixelImage(label) {
  const { Transformer } = await import('@napi-rs/image');
  const imageCase =
    label === 'sequential-high-entropy-webp'
      ? imageCases['near-max-pixels-webp']
      : imageCases[label];
  if (!imageCase) throw new Error('max-image format unsupported');
  const pixels = new Uint8Array(MAX_PIXEL_COUNT * 4);
  if (label === 'sequential-high-entropy-webp') {
    let state = 0x9e37_79b9;
    const pairEntropyRows = Math.floor(MAX_PIXEL_HEIGHT * 0.35);
    for (let y = 0; y < MAX_PIXEL_HEIGHT; y += 1) {
      const runLength = y < pairEntropyRows ? 2 : 4;
      let value = 0;
      for (let x = 0; x < MAX_PIXEL_WIDTH; x += 1) {
        if (x % runLength === 0) {
          state ^= state << 13;
          state ^= state >>> 17;
          state ^= state << 5;
          value = state & 0xff;
        }
        const offset = (y * MAX_PIXEL_WIDTH + x) * 4;
        pixels[offset] = value;
        pixels[offset + 1] = value;
        pixels[offset + 2] = value;
        pixels[offset + 3] = 0xff;
      }
    }
  } else {
    for (let offset = 3; offset < pixels.byteLength; offset += 4) pixels[offset] = 0xff;
  }
  const selectedCase =
    label === 'sequential-high-entropy-webp' ? imageCases['near-max-pixels-webp'] : imageCase;
  const encoded = Uint8Array.from(
    label === 'sequential-high-entropy-webp'
      ? await Transformer.fromRgbaPixels(pixels, MAX_PIXEL_WIDTH, MAX_PIXEL_HEIGHT).webp(75)
      : await selectedCase.encode(
          Transformer.fromRgbaPixels(pixels, MAX_PIXEL_WIDTH, MAX_PIXEL_HEIGHT),
        ),
  );
  if (encoded.byteLength <= 0 || encoded.byteLength > MAX_UPLOAD_BYTES) {
    throw new Error(`max-pixel fixture outside accepted range: ${encoded.byteLength}`);
  }
  return {
    encoded,
    height: MAX_PIXEL_HEIGHT,
    label,
    mimeType: selectedCase.mimeType,
    width: MAX_PIXEL_WIDTH,
  };
}

async function maxImage(label) {
  const extension = label === 'near-max-bytes-png' ? 'png' : imageCases[label].extension;
  const inputPath = `${root}-${label}-input.${extension}`;
  const outputPath = `${root}-${label}-output.${extension}`;
  const fixture = await runFixtureGenerator(label, inputPath);
  const beforeRss = process.memoryUsage().rss;
  const started = performance.now();
  try {
    const pipeline = createScannerPipeline({ malwareScanner: client() });
    const deadline = new AttemptDeadline({
      processingDeadline: new Date(Date.now() + 120_000).toISOString(),
    });
    try {
      const result = await pipeline.process({
        inputPath,
        outputPath,
        purpose: 'request_media',
        declaredMimeType: fixture.mimeType,
        deadline,
      });
      const durationMs = Math.round(performance.now() - started);
      if (durationMs >= 120_000 || result.outputSize > MAX_UPLOAD_BYTES) {
        throw new Error('max-image deadline or output limit failed');
      }
      return {
        format: fixture.mimeType,
        width: fixture.width,
        height: fixture.height,
        pixelCount: fixture.width * fixture.height,
        inputBytes: (await stat(inputPath)).size,
        outputBytes: result.outputSize,
        durationMs,
        beforeRss,
        afterRss: process.memoryUsage().rss,
        cgroupMemoryLimit: await cgroupNumber('/sys/fs/cgroup/memory.max'),
        cgroupSwapLimit: await cgroupNumber('/sys/fs/cgroup/memory.swap.max'),
        cgroupMemoryPeak: await cgroupNumber('/sys/fs/cgroup/memory.peak'),
      };
    } finally {
      deadline.dispose();
    }
  } finally {
    await Promise.all([rm(inputPath, { force: true }), rm(outputPath, { force: true })]);
  }
}

async function generateFixture(label, path) {
  const fixture =
    label === 'near-max-bytes-png' ? await nearMaxBytePng() : await nearMaxPixelImage(label);
  await writeFile(path, fixture.encoded, { flag: 'wx', mode: 0o600 });
  return {
    width: fixture.width,
    height: fixture.height,
    pixelCount: fixture.width * fixture.height,
    inputBytes: fixture.encoded.byteLength,
    mimeType: fixture.mimeType,
  };
}

async function sequentialHighEntropyWebp() {
  const inputPath = `${root}-sequential-input.webp`;
  const fixture = await runFixtureGenerator('sequential-high-entropy-webp', inputPath);
  if (
    fixture.width !== MAX_PIXEL_WIDTH ||
    fixture.height !== MAX_PIXEL_HEIGHT ||
    fixture.pixelCount !== MAX_PIXEL_COUNT ||
    fixture.inputBytes <= 14 * 1024 * 1024 ||
    fixture.inputBytes > MAX_UPLOAD_MIB
  ) {
    throw new Error('sequential fixture outside joint acceptance boundary');
  }
  const pipeline = createScannerPipeline({ malwareScanner: client() });
  const beforeEvents = await cgroupEvents();
  const jobs = [];
  try {
    for (let job = 1; job <= 3; job += 1) {
      const outputPath = `${root}-sequential-output-${job}.webp`;
      const deadline = new AttemptDeadline({
        processingDeadline: new Date(Date.now() + 120_000).toISOString(),
      });
      const started = performance.now();
      const monitor = startMemoryMonitor();
      try {
        const result = await pipeline.process({
          inputPath,
          outputPath,
          purpose: 'request_media',
          declaredMimeType: 'image/webp',
          deadline,
        });
        const durationMs = Math.round(performance.now() - started);
        await monitor.stop();
        const acceptance = {
          durationMs,
          inputBytes: result.inputSize,
          outputBytes: result.outputSize,
          childPidCount: monitor.sample.childPids.size,
          parentPeakRss: monitor.sample.parentPeakRss,
          cgroupObservedPeak: monitor.sample.cgroupObservedPeak,
        };
        if (
          durationMs >= 120_000 ||
          result.inputSize !== fixture.inputBytes ||
          result.outputSize <= 16 * 1024 * 1024 ||
          result.outputSize <= result.inputSize ||
          result.outputSize > MAX_UPLOAD_MIB ||
          monitor.sample.childPids.size !== 1 ||
          monitor.sample.parentPeakRss > PARENT_ACCEPTANCE_PEAK_BYTES ||
          monitor.sample.cgroupObservedPeak > WORKER_ACCEPTANCE_PEAK_BYTES
        ) {
          throw new Error(`sequential job acceptance budget failed: ${JSON.stringify(acceptance)}`);
        }
        jobs.push({
          job,
          durationMs,
          inputBytes: result.inputSize,
          outputBytes: result.outputSize,
          parentRssAfter: process.memoryUsage().rss,
          parentPeakRss: monitor.sample.parentPeakRss,
          childPeakRss: monitor.sample.childPeakRss,
          childPids: [...monitor.sample.childPids],
          cgroupObservedPeak: monitor.sample.cgroupObservedPeak,
          cgroupCurrent: await cgroupNumber('/sys/fs/cgroup/memory.current'),
        });
      } finally {
        await monitor.stop();
        deadline.dispose();
        await rm(outputPath, { force: true });
      }
      const childrenAfter = await directChildren();
      const residueAfter = (await readdir('/tmp/scanner')).filter(
        (entry) => entry !== inputPath.split('/').at(-1),
      );
      if (childrenAfter.length !== 0 || residueAfter.length !== 0) {
        throw new Error('sequential child or temp residue survived');
      }
      jobs.at(-1).childrenAfter = childrenAfter;
      jobs.at(-1).residueAfter = residueAfter;
    }
  } finally {
    await rm(inputPath, { force: true });
  }
  const afterEvents = await cgroupEvents();
  const distinctChildPids = new Set(jobs.flatMap((job) => job.childPids));
  const parentPeaks = jobs.map((job) => job.parentPeakRss);
  const finalResidue = await readdir('/tmp/scanner');
  if (
    jobs.length !== SEQUENTIAL_WEBP_JOB_COUNT ||
    distinctChildPids.size !== SEQUENTIAL_WEBP_JOB_COUNT ||
    Math.max(...parentPeaks) - Math.min(...parentPeaks) > 64 * 1024 * 1024 ||
    afterEvents.oom !== beforeEvents.oom ||
    afterEvents.oomKill !== beforeEvents.oomKill ||
    finalResidue.length !== 0
  ) {
    throw new Error('sequential isolation sustainability failed');
  }
  return {
    status: 'pass',
    probes: ['sequential-high-entropy-webp', 'cgroup-memory', 'temp-cleanup'],
    sequential: {
      fixture,
      jobs,
      distinctChildPids: [...distinctChildPids],
      childrenAfter: await directChildren(),
      residueAfter: finalResidue,
      cgroupMemoryLimit: await cgroupNumber('/sys/fs/cgroup/memory.max'),
      cgroupSwapLimit: await cgroupNumber('/sys/fs/cgroup/memory.swap.max'),
      cgroupMemoryPeak: await cgroupNumber('/sys/fs/cgroup/memory.peak'),
      memoryEventsBefore: beforeEvents,
      memoryEventsAfter: afterEvents,
      oomKilled: false,
    },
  };
}

async function runEvidence() {
  const real = await realEicar();
  const readiness = await client().readiness();
  await staleSignature();
  syntheticSignatureDenials();
  return {
    status: 'pass',
    probes: [
      'real-eicar',
      'stale-signature',
      'missing-signature',
      'unparseable-signature',
      'future-signature',
      'reload-window',
      'temp-cleanup',
    ],
    engineVersion: real.engineVersion,
    detectedSignature: real.detectedSignature,
    signatureVersion: readiness.signatureVersion,
    signatureTimestamp: readiness.signatureTimestamp,
    signatureAgeSeconds: readiness.signatureAgeSeconds,
  };
}

const mode = process.argv[2] ?? 'evidence';
let result;
if (mode === 'evidence') {
  result = await runEvidence();
} else if (mode === 'max-image') {
  const label = process.argv[3];
  if (!label) throw new Error('max-image label required');
  result = {
    status: 'pass',
    probes: [label, 'max-image', 'cgroup-memory', 'temp-cleanup'],
    maximum: await maxImage(label),
  };
} else if (mode === 'sequential-high-entropy-webp') {
  result = await sequentialHighEntropyWebp();
} else if (mode === 'generate-fixture') {
  const label = process.argv[3];
  const path = process.argv[4];
  if (!label || !path) throw new Error('fixture generation arguments required');
  result = await generateFixture(label, path);
} else {
  throw new Error('container-probe mode unsupported');
}
const residue = (await readFile('/proc/self/mountinfo', 'utf8')).includes('/tmp/scanner');
if (!residue) throw new Error('temp-cleanup tmpfs missing');
process.stdout.write(`${JSON.stringify(result)}\n`);
