import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { pathToFileURL } from 'node:url';

export const REQUIRED_UI_STATES = [
  'loading',
  'ready',
  'empty',
  'error',
  'offline',
  'retrying',
  'validation-error',
  'forbidden',
  'blocked',
  'suspended',
  'expired',
  'conflict',
  'ai-unavailable',
  'scanner-pending',
  'upload-rejected',
  'notification-disabled',
  'location-denied',
  'long-text',
  'missing-media',
  'slow-network',
  'keyboard-open',
  'large-text',
  'arabic-rtl',
  'english-ltr',
  'urdu-rtl',
  'hindi-ltr',
  'small-phone',
  'large-phone',
];

export function validateUiCatalog(catalog) {
  const errors = [];
  if (catalog?.schemaVersion !== '1.0.0') errors.push('schemaVersion must be 1.0.0');
  if (catalog?.productionEnabled !== false) errors.push('productionEnabled must be false');
  if (!Array.isArray(catalog?.states)) errors.push('states must be an array');
  const ids = new Set(catalog?.states?.map(({ id }) => id));
  for (const state of REQUIRED_UI_STATES)
    if (!ids.has(state)) errors.push(`missing state ${state}`);
  if (ids.size !== catalog?.states?.length) errors.push('state ids must be unique');
  if (catalog?.dataPolicy !== 'synthetic-only') errors.push('dataPolicy must be synthetic-only');
  return errors;
}

const escapeHtml = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;');

export function renderUiCatalog(catalog) {
  const cards = catalog.states
    .map(
      (state) =>
        `<article><h2>${escapeHtml(state.title)}</h2><code>${escapeHtml(
          state.id,
        )}</code><p>${escapeHtml(state.description)}</p><p><strong>Fixture:</strong> ${escapeHtml(
          state.fixture,
        )}</p></article>`,
    )
    .join('\n');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Sallah UI state catalog</title><style>body{font:16px system-ui;margin:2rem;background:#f7f5f1;color:#17211b}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:1rem}article{background:white;border:1px solid #d8ded9;border-radius:12px;padding:1rem}code{color:#17633b}</style><h1>Sallah synthetic UI state catalog</h1><p>Development-only. No customer data and no network access.</p><main>${cards}</main></html>`;
}

export async function runUiCatalog({ check = false, repositoryRoot = process.cwd() } = {}) {
  const source = join(repositoryRoot, 'apps', 'mobile', 'src', 'dev', 'ui-state-catalog.json');
  const catalog = JSON.parse(await readFile(source, 'utf8'));
  const errors = validateUiCatalog(catalog);
  if (errors.length > 0) throw new Error(errors.join('\n'));
  if (!check) {
    const output = join(repositoryRoot, 'artifacts', 'ui-catalog', 'index.html');
    await mkdir(dirname(output), { recursive: true });
    await writeFile(output, renderUiCatalog(catalog), { encoding: 'utf8', mode: 0o600 });
    console.log(`UI catalog: ${output}`);
  }
  console.log(`UI catalog check: PASS (${catalog.states.length} synthetic states)`);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runUiCatalog({ check: process.argv.includes('--check') });
}
