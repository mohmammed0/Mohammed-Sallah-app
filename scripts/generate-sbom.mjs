import { mkdirSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
mkdirSync('artifacts', { recursive: true });
const npmExec = process.env.npm_execpath;
if (!npmExec) throw new Error('Run through pnpm');
const result = spawnSync(
  process.execPath,
  [npmExec, 'sbom', '--sbom-format', 'cyclonedx', '--out', 'artifacts/sbom.cdx.json'],
  { stdio: 'inherit' },
);
process.exit(result.status ?? 1);
