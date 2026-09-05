import { inspectUiBoundaries } from './ui-boundary-policy.mjs';

const violations = await inspectUiBoundaries(process.cwd());
if (violations.length > 0) {
  console.error('UI boundary check failed:');
  for (const violation of violations) {
    console.error(`- ${violation.file}: ${violation.specifier} (${violation.reason})`);
  }
  process.exit(1);
}

console.log('UI boundary check: PASS (presentation primitives contain no privileged imports)');
