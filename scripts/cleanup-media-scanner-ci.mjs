import { spawn } from 'node:child_process';
import { readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const failures = [];

async function run(command, args, options = {}) {
  return await new Promise((resolve) => {
    const child = spawn(command, args, { shell: false, stdio: 'ignore', ...options });
    child.once('error', () => resolve(false));
    child.once('close', (code) => resolve(code === 0));
  });
}

async function dockerIds(kind, filters) {
  return await new Promise((resolve) => {
    const args = [kind, 'ls', '--quiet', ...filters.flatMap((value) => ['--filter', value])];
    if (kind === 'container') args.splice(2, 0, '--all');
    const child = spawn('docker', args, { shell: false, stdio: ['ignore', 'pipe', 'ignore'] });
    let output = '';
    child.stdout.on('data', (chunk) => {
      output = `${output}${String(chunk)}`.slice(-64 * 1024);
    });
    child.once('error', () => resolve([]));
    child.once('close', (code) =>
      resolve(code === 0 ? output.trim().split(/\r?\n/u).filter(Boolean) : []),
    );
  });
}

await run('supabase', ['stop', '--no-backup']);

for (const name of ['sallah-media-scanner-v2-', 'sallah-m2v-clamd-']) {
  const containers = await dockerIds('container', [`name=${name}`]);
  if (containers.length && !(await run('docker', ['container', 'rm', '--force', ...containers]))) {
    failures.push('container_cleanup_failed');
  }
}

for (const kind of ['network', 'volume']) {
  const ids = await dockerIds(kind, ['label=com.docker.compose.project']);
  for (const id of ids) {
    const inspected = await new Promise((resolve) => {
      const child = spawn(
        'docker',
        ['inspect', '--format', '{{ index .Labels "com.docker.compose.project" }}', id],
        { shell: false, stdio: ['ignore', 'pipe', 'ignore'] },
      );
      let output = '';
      child.stdout.on('data', (chunk) => {
        output = `${output}${String(chunk)}`.slice(-1024);
      });
      child.once('error', () => resolve(''));
      child.once('close', (code) => resolve(code === 0 ? output.trim() : ''));
    });
    if (
      typeof inspected === 'string' &&
      inspected.startsWith('sallah-media-scanner-v2-') &&
      !(await run('docker', [kind, 'rm', id]))
    )
      failures.push(`${kind}_cleanup_failed`);
  }
}

const entries = await readdir(tmpdir()).catch(() => []);
for (const entry of entries) {
  if (entry.startsWith('sallah-media-scanner-v2-') || entry.startsWith('sallah-m2v-integration-')) {
    await rm(join(tmpdir(), entry), { recursive: true, force: true }).catch(() => {
      failures.push('temporary_cleanup_failed');
    });
  }
}

if (failures.length) throw new Error([...new Set(failures)].join(','));
