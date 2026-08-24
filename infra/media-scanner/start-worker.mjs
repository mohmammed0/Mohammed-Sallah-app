import { readFile } from 'node:fs/promises';

import {
  MAX_UPLOAD_BYTES,
  createMediaScannerRuntime,
  runMediaScannerPullLoop,
} from './dist/index.js';

const environments = new Set(['local', 'test', 'preview', 'production']);

function fail() {
  throw new Error('invalid_media_scanner_worker_configuration');
}

function required(name) {
  const value = process.env[name];
  if (!value) fail();
  return value;
}

function exactInteger(name, minimum, maximum) {
  const raw = required(name);
  if (!/^\d+$/u.test(raw)) fail();
  const value = Number(raw);
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) fail();
  return value;
}

function exactOrigin(name, environment) {
  let parsed;
  try {
    parsed = new URL(required(name));
  } catch {
    fail();
  }
  const localOrTest = environment === 'local' || environment === 'test';
  const host = parsed.hostname.replace(/^\[|\]$/gu, '').toLowerCase();
  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash ||
    (parsed.protocol !== 'https:' && !(localOrTest && parsed.protocol === 'http:')) ||
    (!localOrTest && parsed.port !== '') ||
    (!localOrTest && (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(host) || host.includes(':')))
  )
    fail();
  return parsed.origin;
}

async function secret(path) {
  const value = (await readFile(path, { encoding: 'utf8' })).trim();
  const bytes = new TextEncoder().encode(value).byteLength;
  if (bytes < 32 || bytes > 256) fail();
  return value;
}

const environment = required('APP_ENV');
if (!environments.has(environment) || required('UPLOAD_SCANNER_MODE') !== 'external') fail();
const workerId = required('UPLOAD_SCANNER_WORKER_ID');
if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/u.test(workerId)) fail();
if (exactInteger('UPLOAD_SCANNER_MAX_CONCURRENT_JOBS', 1, 1) !== 1) fail();
if (exactInteger('UPLOAD_SCANNER_JOB_DEADLINE_SECONDS', 120, 120) !== 120) fail();
if (exactInteger('UPLOAD_SCANNER_CONTROL_TIMEOUT_MS', 100, 10_000) !== 5_000) fail();
const idleDelayMs = exactInteger('UPLOAD_SCANNER_IDLE_DELAY_MS', 100, 10_000);
const signatureMaxAgeSeconds =
  exactInteger('UPLOAD_SCANNER_SIGNATURE_MAX_AGE_HOURS', 1, 168) * 60 * 60;
const controlSecret = await secret('/run/secrets/scanner-control-secret');
const attestationSecret = await secret('/run/secrets/scanner-attestation-secret');
if (controlSecret === attestationSecret) fail();

const abort = new AbortController();
for (const signal of ['SIGINT', 'SIGTERM']) {
  process.once(signal, () => abort.abort(new Error('scanner_shutdown')));
}

const runtime = createMediaScannerRuntime({
  workerId,
  controlOrigin: exactOrigin('UPLOAD_SCANNER_CONTROL_ORIGIN', environment),
  storageOrigin: exactOrigin('UPLOAD_SCANNER_STORAGE_ORIGIN', environment),
  allowHttp: environment === 'local' || environment === 'test',
  controlSecret,
  attestationSecret,
  signatureMaxAgeSeconds,
  tempRoot: '/tmp/scanner',
  clamd: {
    host: 'clamd',
    port: 3310,
    maxBytes: MAX_UPLOAD_BYTES,
    chunkBytes: 64 * 1024,
    connectTimeoutMs: 2_000,
    responseTimeoutMs: 120_000,
    signatureMaxAgeSeconds,
  },
});

await runMediaScannerPullLoop(runtime, { idleDelayMs, signal: abort.signal });
