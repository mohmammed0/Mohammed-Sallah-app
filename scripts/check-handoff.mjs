import { access, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { REQUIRED_HANDOFF_FILES, validateHandoffManifest } from './handoff-policy.mjs';

const directory = join(process.cwd(), 'docs', 'handoff');
const errors = [];
for (const file of REQUIRED_HANDOFF_FILES) {
  try {
    await access(join(directory, file));
  } catch {
    errors.push(`missing docs/handoff/${file}`);
  }
}

try {
  const manifest = JSON.parse(await readFile(join(directory, 'handoff-manifest.json'), 'utf8'));
  errors.push(...validateHandoffManifest(manifest));
} catch (error) {
  errors.push(
    `handoff-manifest.json is not valid JSON: ${error instanceof Error ? error.message : 'unknown error'}`,
  );
}

if (errors.length > 0) {
  console.error('Handoff check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exit(1);
}

console.log(`Handoff check: PASS (${REQUIRED_HANDOFF_FILES.length} required files)`);
