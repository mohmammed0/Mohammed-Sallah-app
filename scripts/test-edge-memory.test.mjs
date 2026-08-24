import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import test from 'node:test';

const execute = promisify(execFile);
const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));
const configPath = fileURLToPath(new URL('../supabase/functions/deno.json', import.meta.url));
const probePath = fileURLToPath(
  new URL('../supabase/functions/scanner-control/edge-memory-probe.ts', import.meta.url),
);
const MiB = 1024 * 1024;

function toWslPath(value) {
  const matched = /^([a-z]):\\(.*)$/iu.exec(value);
  if (!matched) throw new Error('WSL_PATH_INVALID');
  return `/mnt/${matched[1].toLowerCase()}/${matched[2].replaceAll('\\', '/')}`;
}

async function probe(inputSize, outputSize) {
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
      String(inputSize),
      String(outputSize),
    ],
    { cwd: repositoryRoot, timeout: 30_000 },
  );
  assert.equal(stderr, '');
  return JSON.parse(stdout);
}

test('loaded production scanner-control stays size-independent below the Edge memory target', async (t) => {
  const ten = await probe(10 * MiB, 10 * MiB);
  const twenty = await probe(20 * MiB, 20 * MiB);

  t.diagnostic(`10 MiB metadata peak RSS: ${ten.peakRssBytes} bytes`);
  t.diagnostic(`20 MiB metadata peak RSS: ${twenty.peakRssBytes} bytes`);

  assert.equal(ten.handlerStatus, 200);
  assert.equal(twenty.handlerStatus, 200);
  assert.ok(ten.rpcCalls >= 3);
  assert.ok(twenty.rpcCalls >= 3);
  assert.equal(ten.signedUploadCalls, 1);
  assert.equal(twenty.signedUploadCalls, 1);
  assert.ok(ten.sampleCount >= 2);
  assert.ok(twenty.sampleCount >= 2);
  assert.equal(ten.encodedBytes, twenty.encodedBytes);
  assert.ok(Math.abs(twenty.peakRssBytes - ten.peakRssBytes) <= 8 * MiB);
  assert.ok(Math.max(ten.peakRssBytes, twenty.peakRssBytes) <= 128 * MiB);
  assert.ok(128 * MiB < 256 * MiB);
});

test('production memory probe rejects metadata above the 20 MiB product maximum', async () => {
  await assert.rejects(probe(20 * MiB + 1, 20 * MiB), /EDGE_METADATA_SIZE_INVALID/u);
});
