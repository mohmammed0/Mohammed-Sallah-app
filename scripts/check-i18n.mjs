import { readdirSync, readFileSync } from 'node:fs';
import { extname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
const source = readFileSync(new URL('../packages/i18n/src/index.ts', import.meta.url), 'utf8');
for (const locale of ['ar', 'en', 'ur', 'hi']) {
  const declaration = new RegExp(`const ${locale}(?:: TranslationShape)? = \\{`);
  const resource = new RegExp(`${locale}: \\{ translation: ${locale} \\}`);
  if (!declaration.test(source)) throw new Error(`Missing locale dictionary ${locale}`);
  if (!resource.test(source)) throw new Error(`Missing i18next resource ${locale}`);
}

const mobileRoot = fileURLToPath(new URL('../apps/mobile', import.meta.url));
const sourceExtensions = new Set(['.ts', '.tsx']);
const directArabic = /[\u0600-\u06ff]/u;
const violations = [];
function inspectDirectory(directory) {
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.expo')) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      inspectDirectory(path);
      continue;
    }
    if (!sourceExtensions.has(extname(entry.name))) continue;
    const lines = readFileSync(path, 'utf8').split(/\r?\n/u);
    lines.forEach((line, index) => {
      if (directArabic.test(line)) violations.push(`${relative(mobileRoot, path)}:${index + 1}`);
    });
  }
}
inspectDirectory(mobileRoot);
if (violations.length > 0)
  throw new Error(
    `Direct Arabic mobile strings must use @sallah/i18n keys:\n${violations.join('\n')}`,
  );
console.log(
  'Localization dictionaries present for ar, en, ur, and hi; mobile source has no direct Arabic strings.',
);
