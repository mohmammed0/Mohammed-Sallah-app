import { spawnTool } from './resolve-tool.mjs';
const check = spawnTool('k6', ['version'], {
  encoding: 'utf8',
});
if (check.status !== 0) {
  console.error('NOT RUN: k6 is not installed. Run: k6 run tests/load/smoke.js');
  process.exit(2);
}
const baseUrlArgs = process.env.BASE_URL ? ['-e', `BASE_URL=${process.env.BASE_URL}`] : [];
const result = spawnTool('k6', ['run', ...baseUrlArgs, 'tests/load/smoke.js'], {
  stdio: 'inherit',
});
process.exit(result.status ?? 1);
