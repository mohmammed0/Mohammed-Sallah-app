import { spawnTool } from './resolve-tool.mjs';

const environment = {
  ...process.env,
  APP_ENV: 'test',
  NEXT_PUBLIC_APP_ENV: 'test',
  EXPO_PUBLIC_APP_ENV: 'test',
};
const result = spawnTool('pnpm', ['build'], { env: environment, stdio: 'inherit' });
if (result.error) {
  console.error('VALIDATION_BUILD_FAILED');
  process.exit(2);
}
process.exit(result.status ?? 2);
