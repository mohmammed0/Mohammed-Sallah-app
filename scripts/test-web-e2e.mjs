import { spawnSync } from 'node:child_process';
import { spawnTool } from './resolve-tool.mjs';

function localPublicEnvironment() {
  const result = spawnTool('supabase', ['status', '-o', 'env'], { encoding: 'utf8' });
  if (result.status !== 0) throw new Error('LOCAL_SUPABASE_REQUIRED_FOR_WEB_E2E');
  const values = {};
  for (const line of (result.stdout ?? '').split(/\r?\n/u)) {
    const match = /^([A-Z_]+)="([^"]*)"$/u.exec(line.trim());
    if (match?.[1] && match[2]) values[match[1]] = match[2];
  }
  if (!values.API_URL || !values.PUBLISHABLE_KEY) {
    throw new Error('LOCAL_SUPABASE_PUBLIC_ENV_INVALID');
  }
  return {
    NEXT_PUBLIC_SUPABASE_URL: values.API_URL,
    NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: values.PUBLISHABLE_KEY,
  };
}

const inherited = process.env;
const publicEnvironment =
  inherited.NEXT_PUBLIC_SUPABASE_URL && inherited.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    ? {
        NEXT_PUBLIC_SUPABASE_URL: inherited.NEXT_PUBLIC_SUPABASE_URL,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: inherited.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
      }
    : localPublicEnvironment();
const environment = { ...inherited, ...publicEnvironment };
const supabaseUrl = new URL(publicEnvironment.NEXT_PUBLIC_SUPABASE_URL);
if (!['127.0.0.1', 'localhost'].includes(supabaseUrl.hostname)) {
  throw new Error('WEB_E2E_REQUIRES_LOCAL_SUPABASE');
}
const pnpm = inherited.npm_execpath;
if (!pnpm) throw new Error('RUN_WEB_E2E_THROUGH_PNPM');

const reset = spawnTool('supabase', ['db', 'reset', '--local'], {
  encoding: 'utf8',
  env: environment,
});
if (reset.status !== 0) {
  process.stderr.write(reset.stderr ?? 'LOCAL_SUPABASE_RESET_FAILED\n');
  process.exit(reset.status ?? 1);
}

function run(args) {
  const result = spawnSync(process.execPath, [pnpm, ...args], {
    cwd: process.cwd(),
    env: environment,
    stdio: 'inherit',
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

run(['--filter', '@sallah/web', 'build']);
run(['exec', 'playwright', 'test']);
