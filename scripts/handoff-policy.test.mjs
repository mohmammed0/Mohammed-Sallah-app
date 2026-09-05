import assert from 'node:assert/strict';
import test from 'node:test';
import { validateHandoffManifest } from './handoff-policy.mjs';

const completeManifest = () => ({
  schemaVersion: '1.1.0',
  repository: 'mohmammed0/Mohammed-Sallah-app',
  canonicalBranch: 'main',
  exactSha: 'git:HEAD',
  exactShaCommand: 'git rev-parse HEAD',
  sourceCommit: 'git:HEAD',
  finalMainSha: 'reported-externally-after-merge',
  releaseTag: 'sallah-multitool-handoff-v1',
  generatedAt: '2026-08-27T00:00:00.000Z',
  finalIntegrationPr: { number: 36, base: 'main', status: 'final-integration-gate' },
  versions: { node: '24.19.0' },
  apps: ['mobile'],
  packages: ['domain'],
  routes: ['/'],
  roles: ['customer'],
  ciResults: ['pending'],
  validationCounts: ['pending'],
  externalGates: ['physical-device'],
  allowedUiPaths: ['apps/mobile/src/components/**'],
  deniedPaths: ['supabase/migrations/**'],
  firstFilesByTool: ['docs/handoff/README.md'],
});

test('accepts a complete non-stale handoff manifest', () => {
  assert.deepEqual(validateHandoffManifest(completeManifest()), []);
});

test('rejects a parallel handoff branch after main becomes canonical', () => {
  const manifest = completeManifest();
  manifest.canonicalBranch = 'codex/repository-finalization-multitool-handoff-v1';
  assert.match(validateHandoffManifest(manifest).join('\n'), /canonicalBranch must be main/u);
});

test('rejects a manifest that omits the immutable release tag contract', () => {
  const manifest = completeManifest();
  delete manifest.releaseTag;
  assert.match(validateHandoffManifest(manifest).join('\n'), /releaseTag/u);
});

test('rejects a literal SHA because a tracked manifest cannot self-reference its commit', () => {
  const manifest = completeManifest();
  manifest.exactSha = '0123456789abcdef0123456789abcdef01234567';
  assert.match(validateHandoffManifest(manifest).join('\n'), /git:HEAD/u);
});

test('rejects missing required collections', () => {
  const manifest = completeManifest();
  manifest.routes = [];
  assert.match(validateHandoffManifest(manifest).join('\n'), /routes/u);
});
