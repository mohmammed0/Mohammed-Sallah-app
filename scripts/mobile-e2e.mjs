import { spawnSync } from 'node:child_process';
const check = spawnSync('maestro', ['--version'], {
  encoding: 'utf8',
  shell: process.platform === 'win32',
});
if (check.status !== 0) {
  console.error(
    'NOT RUN: Maestro CLI and a mobile emulator/device are required. Run: maestro test tests/e2e-mobile',
  );
  process.exit(2);
}
const result = spawnSync('maestro', ['test', 'tests/e2e-mobile'], {
  stdio: 'inherit',
  shell: process.platform === 'win32',
});
process.exit(result.status ?? 1);
