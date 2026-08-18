import { spawnSync } from 'node:child_process';
const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('command required');
  process.exit(2);
}
const result = spawnSync(command, args, { stdio: 'inherit', shell: process.platform === 'win32' });
if (result.error) {
  console.error(result.error.message);
  process.exit(2);
}
process.exit(result.status ?? 2);
