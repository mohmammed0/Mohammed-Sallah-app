import { spawnTool } from './resolve-tool.mjs';
const check = spawnTool('maestro', ['--version'], {
  encoding: 'utf8',
});
if (check.status !== 0) {
  console.error(
    'NOT RUN: Maestro CLI and a mobile emulator/device are required. Run: maestro test tests/e2e-mobile',
  );
  process.exit(2);
}
const result = spawnTool('maestro', ['test', 'tests/e2e-mobile'], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
