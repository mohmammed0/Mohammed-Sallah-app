import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
const files = execFileSync('git', ['ls-files'], { encoding: 'utf8' })
  .trim()
  .split(/\r?\n/)
  .filter(Boolean);
const findings = [];
const patterns = [
  /sk-[A-Za-z0-9_-]{20,}/,
  /sb_secret_[A-Za-z0-9_-]{20,}/,
  /service_role.*eyJ[A-Za-z0-9._-]+/i,
  /-----BEGIN (RSA |EC )?PRIVATE KEY-----/,
];
for (const file of files) {
  if (/pnpm-lock|THIRD_PARTY/.test(file)) continue;
  let text;
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    continue;
  }
  for (const pattern of patterns) if (pattern.test(text)) findings.push(`${file}: ${pattern}`);
}
if (findings.length) {
  console.error('Potential committed secrets:', findings);
  process.exit(1);
}
const npmExec = process.env.npm_execpath;
if (npmExec) {
  const audit = spawnSync(process.execPath, [npmExec, 'audit', '--audit-level', 'high'], {
    stdio: 'inherit',
  });
  if (audit.status !== 0) process.exit(audit.status ?? 1);
}
console.log('Secret pattern scan and high-severity dependency audit passed.');
