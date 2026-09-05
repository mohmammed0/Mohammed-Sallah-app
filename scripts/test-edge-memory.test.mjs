import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

import {
  edgeHardCeilingBytes,
  evaluateEdgeMemorySamples,
  minimumSamplesPerScenario,
} from './edge-memory-policy.mjs';

const execute = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const configPath = fileURLToPath(new URL('../supabase/functions/deno.json', import.meta.url));
const probePath = fileURLToPath(
  new URL('../supabase/functions/scanner-control/edge-memory-probe.ts', import.meta.url),
);
const MiB = 1024 * 1024;
let syntheticProcessId = 10_000;

function syntheticSample(representedBytes, overrides = {}) {
  return {
    processId: syntheticProcessId++,
    inputSize: representedBytes,
    outputSize: representedBytes,
    handlerStatus: 200,
    rpcCalls: 3,
    signedUploadCalls: 1,
    sampleCount: 3,
    baselineRssBytes: 50 * MiB,
    peakRssBytes: 60 * MiB,
    baselineHeapBytes: 10 * MiB,
    peakHeapBytes: 12 * MiB,
    baselineHeapTotalBytes: 16 * MiB,
    peakHeapTotalBytes: 16 * MiB,
    baselineExternalBytes: 512 * 1024,
    peakExternalBytes: 1 * MiB,
    baselineArrayBufferBytes: 0,
    peakArrayBufferBytes: 0,
    encodedBytes: 723,
    responseBytes: 334,
    ...overrides,
  };
}

function syntheticSeries(representedBytes, overrides = {}) {
  return Array.from({ length: minimumSamplesPerScenario }, () =>
    syntheticSample(representedBytes, overrides),
  );
}

function toWslPath(value) {
  const matched = /^([a-z]):\\(.*)$/iu.exec(value);
  if (!matched) throw new Error('WSL_PATH_INVALID');
  return `/mnt/${matched[1].toLowerCase()}/${matched[2].replaceAll('\\', '/')}`;
}

async function probe(...args) {
  const windowsWithWsl = process.platform === 'win32' && !process.env.DENO_BIN;
  const executable = windowsWithWsl ? 'wsl.exe' : (process.env.DENO_BIN ?? 'deno');
  const [runtimeConfig, runtimeProbe] = windowsWithWsl
    ? [toWslPath(configPath), toWslPath(probePath)]
    : [configPath, probePath];
  const { stdout, stderr } = await execute(
    executable,
    [
      ...(windowsWithWsl ? ['deno'] : []),
      'run',
      '--quiet',
      '--config',
      runtimeConfig,
      runtimeProbe,
      ...args.map(String),
    ],
    { cwd: repositoryRoot, timeout: 30_000 },
  );
  assert.equal(stderr, '');
  return JSON.parse(stdout);
}

async function collectSamples(mode) {
  const order = [10, 20, 20, 10, 10, 20, 20, 10, 10, 20];
  const samples = [];
  for (const sizeMiB of order) {
    samples.push(await probe(sizeMiB * MiB, sizeMiB * MiB, ...(mode === undefined ? [] : [mode])));
  }
  return samples;
}

test('loaded production scanner-control stays size-independent below the Edge memory target', async (t) => {
  const samples = await collectSamples();
  const summary = evaluateEdgeMemorySamples(samples);

  t.diagnostic(
    `10 MiB median RSS baseline/peak/growth: ${summary.rssBaseline.tenMedian}/${summary.rssPeak.tenMedian}/${summary.rssGrowth.tenMedian}`,
  );
  t.diagnostic(
    `20 MiB median RSS baseline/peak/growth: ${summary.rssBaseline.twentyMedian}/${summary.rssPeak.twentyMedian}/${summary.rssGrowth.twentyMedian}`,
  );
  t.diagnostic(`hard peak RSS: ${summary.hardPeakRssBytes} bytes`);

  assert.equal(summary.sampleCount, minimumSamplesPerScenario * 2);
  assert.ok(summary.hardPeakRssBytes <= edgeHardCeilingBytes);
  assert.ok(128 * MiB < 256 * MiB);
});

test('isolated production probe detects an actual size-proportional allocation fault', async () => {
  const samples = await collectSamples('--synthetic-proportional-allocation');
  assert.throws(
    () => evaluateEdgeMemorySamples(samples),
    /EDGE_MEMORY_(?:RSS|EXTERNAL)(?:_BASELINE|_PEAK)?_GROWTH/u,
  );
});

test('production memory probe rejects metadata above the 20 MiB product maximum', async () => {
  await assert.rejects(probe(20 * MiB + 1, 20 * MiB), /EDGE_METADATA_SIZE_INVALID/u);
});

test('memory policy rejects media-like, Base64-like, proportional, and over-ceiling allocations', () => {
  const ten = syntheticSeries(10 * MiB);
  assert.throws(
    () =>
      evaluateEdgeMemorySamples([
        ...ten,
        ...syntheticSeries(20 * MiB, { peakArrayBufferBytes: 10 * MiB }),
      ]),
    /EDGE_MEMORY_ARRAY_BUFFER_(?:BASELINE_|PEAK_)?GROWTH/u,
  );
  assert.throws(
    () =>
      evaluateEdgeMemorySamples([
        ...ten,
        ...syntheticSeries(20 * MiB, { peakHeapBytes: 24 * MiB }),
      ]),
    /EDGE_MEMORY_HEAP_(?:BASELINE_|PEAK_)?GROWTH/u,
  );
  assert.throws(
    () =>
      evaluateEdgeMemorySamples([
        ...ten,
        ...syntheticSeries(20 * MiB, { peakExternalBytes: 12 * MiB }),
      ]),
    /EDGE_MEMORY_EXTERNAL_(?:BASELINE_|PEAK_)?GROWTH/u,
  );
  assert.throws(
    () =>
      evaluateEdgeMemorySamples([
        ...ten,
        ...syntheticSeries(20 * MiB, { peakRssBytes: edgeHardCeilingBytes + 1 }),
      ]),
    /EDGE_MEMORY_HARD_CEILING/u,
  );
});

test('memory policy requires multiple samples and uses a median without hiding hard outliers', () => {
  assert.throws(
    () =>
      evaluateEdgeMemorySamples([
        ...syntheticSeries(10 * MiB).slice(0, minimumSamplesPerScenario - 1),
        ...syntheticSeries(20 * MiB),
      ]),
    /EDGE_MEMORY_SAMPLE_COUNT/u,
  );

  const noisyTwenty = syntheticSeries(20 * MiB);
  noisyTwenty[0] = syntheticSample(20 * MiB, { peakRssBytes: 100 * MiB });
  assert.doesNotThrow(() =>
    evaluateEdgeMemorySamples([...syntheticSeries(10 * MiB), ...noisyTwenty]),
  );
  noisyTwenty[0] = syntheticSample(20 * MiB, { peakRssBytes: edgeHardCeilingBytes + 1 });
  assert.throws(
    () => evaluateEdgeMemorySamples([...syntheticSeries(10 * MiB), ...noisyTwenty]),
    /EDGE_MEMORY_HARD_CEILING/u,
  );
});

test('memory policy rejects cross-scenario samples retained in one process', () => {
  const contaminated = [...syntheticSeries(10 * MiB), ...syntheticSeries(20 * MiB)].map(
    (sample) => ({ ...sample, processId: 42 }),
  );
  assert.throws(() => evaluateEdgeMemorySamples(contaminated), /EDGE_MEMORY_PROCESS_ISOLATION/u);
});

test('memory policy rejects size-proportional memory retained before measurement begins', () => {
  const ten = syntheticSeries(10 * MiB, {
    baselineRssBytes: 50 * MiB,
    peakRssBytes: 51 * MiB,
  });
  const twenty = syntheticSeries(20 * MiB, {
    baselineRssBytes: 70 * MiB,
    peakRssBytes: 71 * MiB,
  });
  assert.throws(
    () => evaluateEdgeMemorySamples([...ten, ...twenty]),
    /EDGE_MEMORY_RSS_BASELINE_GROWTH/u,
  );
});

test('memory policy reports an unavailable array-buffer metric without inventing a zero sample', () => {
  const samples = [...syntheticSeries(10 * MiB), ...syntheticSeries(20 * MiB)].map((sample) => {
    const { peakArrayBufferBytes: _unavailable, ...measured } = sample;
    return measured;
  });
  assert.deepEqual(evaluateEdgeMemorySamples(samples).arrayBuffers, { available: false });
});
