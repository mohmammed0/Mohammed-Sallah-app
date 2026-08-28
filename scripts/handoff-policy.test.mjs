import assert from 'node:assert/strict';
import test from 'node:test';
import { validateHandoffManifest } from './handoff-policy.mjs';

const completeManifest = () => ({
  schemaVersion: '1.0.0',
  repository: 'mohmammed0/Mohammed-Sallah-app',
  canonicalBranch: 'codex/repository-finalization-multitool-handoff-v1',
  exactSha: 'git:HEAD',
  exactShaCommand: 'git rev-parse HEAD',
  generatedAt: '2026-08-27T00:00:00.000Z',
  draftPr: { status: 'draft' },
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
