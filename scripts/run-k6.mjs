import { spawn, spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { spawnTool } from './resolve-tool.mjs';

const check = spawnTool('k6', ['version'], { encoding: 'utf8' });
if (check.status !== 0) {
  console.error('NOT RUN: k6 is not installed. Run: k6 run tests/load/smoke.js');
  process.exit(2);
}

const pnpm = process.env.npm_execpath;
if (!pnpm) throw new Error('RUN_LOAD_TEST_THROUGH_PNPM');
const localHealthUrl = 'http://127.0.0.1:3000/api/health';

async function healthIsReady() {
  try {
    return (await fetch(localHealthUrl, { signal: AbortSignal.timeout(1_000) })).ok;
  } catch {
    return false;
  }
}

async function waitForHealth(server) {
  const deadline = Date.now() + 120_000;
  while (Date.now() < deadline) {
    if (server.exitCode !== null) throw new Error(`LOAD_SERVER_EXITED_${server.exitCode}`);
    if (await healthIsReady()) return;
    await delay(250);
  }
  throw new Error('LOAD_SERVER_START_TIMEOUT');
}

function baseUrlForK6() {
  if (process.platform !== 'win32') return 'http://127.0.0.1:3000';
  const result = spawnSync('wsl.exe', ['-e', 'ip', 'route', 'show', 'default'], {
    encoding: 'utf8',
    shell: false,
  });
  const host = /default via ([^\s]+)/u.exec(result.stdout ?? '')?.[1];
  if (!host) throw new Error('WSL_WINDOWS_HOST_NOT_FOUND');
  return `http://${host}:3000`;
}

function assertK6TargetReachable(baseUrl) {
  if (process.platform !== 'win32') return;
  const result = spawnSync(
    'wsl.exe',
    [
      '-e',
      'curl',
      '--fail',
      '--silent',
      '--show-error',
      '--max-time',
      '5',
      `${baseUrl}/api/health`,
    ],
    { stdio: 'ignore', shell: false },
  );
  if (result.status !== 0) throw new Error('WSL_LOAD_SERVER_UNREACHABLE');
}

if (await healthIsReady()) throw new Error('LOAD_TEST_PORT_3000_ALREADY_IN_USE');
const build = spawnSync(process.execPath, [pnpm, '--filter', '@sallah/web', 'build'], {
  cwd: process.cwd(),
  env: process.env,
  stdio: 'inherit',
});
if (build.status !== 0) process.exit(build.status ?? 1);

const nextBin = resolve('apps/web/node_modules/next/dist/bin/next');
const server = spawn(process.execPath, [nextBin, 'start', '-H', '0.0.0.0', '-p', '3000'], {
  cwd: resolve('apps/web'),
  env: process.env,
  stdio: ['ignore', 'inherit', 'inherit'],
  windowsHide: true,
});

let exitCode = 1;
try {
  await waitForHealth(server);
  const baseUrl = baseUrlForK6();
  assertK6TargetReachable(baseUrl);
  const result = spawnTool('k6', ['run', '-e', `BASE_URL=${baseUrl}`, 'tests/load/smoke.js'], {
    stdio: 'inherit',
  });
  exitCode = result.status ?? 1;
} finally {
  server.kill();
}
process.exit(exitCode);
