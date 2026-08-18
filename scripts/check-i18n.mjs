import { readFileSync } from 'node:fs';
const source = readFileSync(new URL('../packages/i18n/src/index.ts', import.meta.url), 'utf8');
for (const locale of ['ar', 'en', 'ur', 'hi']) {
  const declaration = new RegExp(`const ${locale}(?:: TranslationShape)? = \\{`);
  const resource = new RegExp(`${locale}: \\{ translation: ${locale} \\}`);
  if (!declaration.test(source)) throw new Error(`Missing locale dictionary ${locale}`);
  if (!resource.test(source)) throw new Error(`Missing i18next resource ${locale}`);
}
console.log(
  'Localization dictionaries present for ar, en, ur, and hi; parity is covered by unit tests.',
);
