import { spawnTool } from './resolve-tool.mjs';
const probe = spawnTool('deno', ['--version'], {
  stdio: 'ignore',
});
if (probe.status !== 0) {
  console.error('Deno is required. Install Deno 2.x, then run: pnpm test:functions');
  process.exit(2);
}
const result = spawnTool(
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
  },
);
process.exit(result.status ?? 1);
