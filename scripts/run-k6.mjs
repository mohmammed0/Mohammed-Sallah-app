import { spawnSync } from 'node:child_process';
const check = spawnSync('k6', ['version'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
if (check.status !== 0) {
  console.error('NOT RUN: k6 is not installed. Run: k6 run tests/load/smoke.js');
  process.exit(2);
}
const result = spawnSync('k6', ['run', 'tests/load/smoke.js'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
