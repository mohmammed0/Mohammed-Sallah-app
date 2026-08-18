import { spawnSync } from 'node:child_process';

const npmExec = process.env.npm_execpath;
if (!npmExec) throw new Error('Run through pnpm');
const result = spawnSync(process.execPath, [npmExec, 'licenses', 'list', '--json'], {
  encoding: 'utf8',
  maxBuffer: 20 * 1024 * 1024,
});
if (result.status !== 0) {
  console.error(result.stderr);
  process.exit(result.status ?? 1);
}

const report = JSON.parse(result.stdout);
const permissive = new Set([
  'MIT',
  'ISC',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  '0BSD',
  'BlueOak-1.0.0',
  'CC0-1.0',
  'Python-2.0',
  'Unicode-3.0',
  'Unlicense',
]);
const exactExceptions = new Map([
  ['CC-BY-4.0', new Set(['caniuse-lite'])],
  ['CC-BY-3.0', new Set(['spdx-exceptions'])],
  [
    'MPL-2.0',
    new Set([
      'lightningcss',
      'lightningcss-win32-x64-msvc',
      'lightningcss-linux-x64-gnu',
      'lightningcss-linux-x64-musl',
      'lightningcss-darwin-arm64',
      'lightningcss-darwin-x64',
    ]),
  ],
]);
function hasPermissiveChoice(expression) {
  return expression
    .replace(/[()]/g, '')
    .split(/\s+OR\s+/)
    .some((choice) => permissive.has(choice.trim()));
}
function hasOnlyPermissiveAnd(expression) {
  const choices = expression.replace(/[()]/g, '').split(/\s+AND\s+/);
  return choices.length > 1 && choices.every((choice) => permissive.has(choice.trim()));
}
const denied = [];
for (const [license, packages] of Object.entries(report)) {
  const names = Object.values(packages).map((item) => item.name);
  const exception = exactExceptions.get(license);
  const accepted =
    permissive.has(license) ||
    hasPermissiveChoice(license) ||
    hasOnlyPermissiveAnd(license) ||
    (exception && names.every((name) => exception.has(name)));
  if (!accepted || /\bAGPL|\bSSPL|Commons Clause|Business Source/i.test(license))
    denied.push({ license, packages: names });
}
if (denied.length) {
  console.error('Denied or unreviewed dependency licenses:', JSON.stringify(denied));
  process.exit(1);
}
console.log(
  'Dependency licenses passed: permissive choices plus package-scoped documented data/build exceptions.',
);
