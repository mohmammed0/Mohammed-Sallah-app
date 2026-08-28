import assert from 'node:assert/strict';
import test from 'node:test';
import { REQUIRED_UI_STATES, renderUiCatalog, validateUiCatalog } from './ui-catalog.mjs';

const catalog = () => ({
  schemaVersion: '1.0.0',
  productionEnabled: false,
  dataPolicy: 'synthetic-only',
  states: REQUIRED_UI_STATES.map((id) => ({
    id,
    title: id,
    description: id,
    fixture: `fixture-${id}`,
  })),
});

test('requires every deterministic handoff state', () => {
  assert.deepEqual(validateUiCatalog(catalog()), []);
  const incomplete = catalog();
  incomplete.states.pop();
  assert.match(validateUiCatalog(incomplete).join('\n'), /missing state/u);
});

test('fails closed when a catalog is production-enabled', () => {
  const unsafe = catalog();
  unsafe.productionEnabled = true;
  assert.match(validateUiCatalog(unsafe).join('\n'), /productionEnabled/u);
});

test('escapes fixture content in the generated local catalog', () => {
  const safe = catalog();
  safe.states[0].description = '<script>alert(1)</script>';
  const html = renderUiCatalog(safe);
  assert.doesNotMatch(html, /<script>/u);
  assert.match(html, /&lt;script&gt;/u);
});
