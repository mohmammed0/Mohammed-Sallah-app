import { spawnSync } from 'node:child_process';
const probe = spawnSync('deno', ['--version'], {
  stdio: 'ignore',
  shell: process.platform === 'win32',
});
if (probe.status !== 0) {
  console.error('Deno is required. Install Deno 2.x, then run: pnpm test:functions');
  process.exit(2);
}
const result = spawnSync(
  'deno',
  [
    'test',
    '--config',
    'supabase/functions/deno.json',
    '--allow-env',
    '--allow-read',
    'supabase/functions',
  ],
  {
    stdio: 'inherit',
    shell: process.platform === 'win32',
  },
);
process.exit(result.status ?? 1);
