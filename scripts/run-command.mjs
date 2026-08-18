import { spawnTool } from './resolve-tool.mjs';
const [command, ...args] = process.argv.slice(2);
if (!command) {
  console.error('command required');
  process.exit(2);
}
const result = spawnTool(command, args, { stdio: 'inherit' });
if (result.error) {
  console.error(result.error.message);
  process.exit(2);
}
process.exit(result.status ?? 2);
