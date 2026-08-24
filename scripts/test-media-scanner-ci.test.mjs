import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const repositoryRoot = new URL('../', import.meta.url);

async function source(path) {
  return await readFile(new URL(path, repositoryRoot), 'utf8');
}

function jobBlock(workflow, name, nextName) {
  const end = nextName ? `(?=\\n  ${nextName}:)` : '$';
  return new RegExp(`\\n  ${name}:\\n(?<job>[\\s\\S]*?)${end}`, 'u').exec(workflow)?.groups?.job;
}

test('CI has a mandatory scanner job covering every repository/local gate', async () => {
  const workflow = await source('.github/workflows/ci.yml');
  const scanner = jobBlock(workflow, 'media-scanner', 'mobile');
  assert.ok(scanner, 'media-scanner job missing');
  assert.doesNotMatch(scanner, /^    if:/mu);
  assert.doesNotMatch(workflow, /^\s*paths(?:-ignore)?:/mu);

  for (const command of [
    'pnpm --filter @sallah/media-scanner lint',
    'pnpm --filter @sallah/media-scanner typecheck',
    'pnpm --filter @sallah/media-scanner test',
    'pnpm --filter @sallah/media-scanner build',
    'pnpm test:media-scanner:unit',
    'pnpm test:edge-memory',
    'pnpm test:media-scanner',
    'pnpm test:media-scanner:remux',
    'docker build --pull --file infra/media-scanner/worker.Dockerfile --tag sallah-media-scanner-worker:m2v-node24.19.0-image1.13.0 .',
    'supabase db reset',
    'supabase/tests/database/media_scan_concurrency.sh',
    'pnpm test:media-scanner:supabase',
    'pnpm licenses:check',
    'pnpm audit --audit-level high',
    'pnpm security:scan',
    'pnpm sbom:generate',
    'pnpm sbom:container',
  ]) {
    assert.match(scanner, new RegExp(command.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&'), 'u'));
  }

  assert.match(scanner, /^\s*- run: pnpm test:media-scanner\s*$/mu);
  assert.match(scanner, /SALLAH_MEDIA_SCANNER_SIGNATURE_MODE:\s*deterministic/u);

  assert.match(scanner, /deno test[^\n]*scanner-control/u);
  assert.match(scanner, /deno test[^\n]*(?:scan-upload|privacy-worker)/u);
  assert.match(scanner, /UPLOAD_SCANNER_SIGNATURE_MAX_AGE_HOURS/u);
  assert.match(scanner, /UPLOAD_SCANNER_CONTROL_SECRET/u);
  assert.match(scanner, /UPLOAD_SCANNER_ATTESTATION_SECRET/u);
  assert.match(scanner, /if: always\(\)[\s\S]*cleanup-media-scanner-ci\.mjs/u);
  assert.doesNotMatch(workflow, /uses:\s*[^\s]+@v\d/u);
  assert.doesNotMatch(workflow, /deno-version:\s*v?\d+\.x/u);
  assert.match(workflow, /deno-version:\s*2\.9\.5/u);
});

test('release readiness forwards every scanner production contract variable', async () => {
  const workflow = await source('.github/workflows/release-readiness.yml');
  assert.match(workflow, /pnpm test:edge-memory/u);
  assert.doesNotMatch(workflow, /uses:\s*[^\s]+@v\d/u);
  assert.match(workflow, /deno-version:\s*2\.9\.5/u);
  for (const variable of [
    'UPLOAD_SCANNER_MODE',
    'UPLOAD_SCANNER_CONTROL_ORIGIN',
    'UPLOAD_SCANNER_STORAGE_ORIGIN',
    'UPLOAD_SCANNER_STORAGE_S3_ACCESS_KEY_ID',
    'UPLOAD_SCANNER_STORAGE_S3_SECRET_ACCESS_KEY',
    'UPLOAD_SCANNER_STORAGE_S3_REGION',
    'UPLOAD_SCANNER_CONTROL_SECRET',
    'UPLOAD_SCANNER_ATTESTATION_SECRET',
    'UPLOAD_SCANNER_NETWORK_POLICY',
    'UPLOAD_SCANNER_SIGNATURE_MAX_AGE_HOURS',
    'UPLOAD_SCANNER_MAX_CONCURRENT_JOBS',
    'UPLOAD_SCANNER_JOB_DEADLINE_SECONDS',
    'UPLOAD_SCANNER_CONTROL_TIMEOUT_MS',
    'UPLOAD_SCANNER_WORKER_ID',
    'UPLOAD_SCANNER_IDLE_DELAY_MS',
    'UPLOAD_SCANNER_ALERTS_ENABLED',
  ]) {
    assert.match(workflow, new RegExp(`^\\s+${variable}:`, 'mu'), variable);
  }
  assert.match(
    workflow,
    /UPLOAD_SCANNER_CONTROL_SECRET:\s*\$\{\{ secrets\.UPLOAD_SCANNER_CONTROL_SECRET \}\}/u,
  );
  assert.match(
    workflow,
    /UPLOAD_SCANNER_ATTESTATION_SECRET:\s*\$\{\{ secrets\.UPLOAD_SCANNER_ATTESTATION_SECRET \}\}/u,
  );

  const validatorStep =
    /^\s*- run: pnpm config:validate:production\n(?<step>[\s\S]*?)(?=^\s*- run: pnpm build)/mu.exec(
      workflow,
    )?.groups?.step;
  assert.ok(validatorStep, 'production validator step missing');
  assert.match(validatorStep, /^\s+APP_ENV: production$/mu);
  assert.match(
    validatorStep,
    /^\s+SALLAH_ANDROID_GOOGLE_MAPS_API_KEY:\s*\$\{\{ secrets\.SALLAH_ANDROID_GOOGLE_MAPS_API_KEY \}\}$/mu,
  );

  const buildStep = /^\s*- run: pnpm build\n(?<step>[\s\S]*)$/mu.exec(workflow)?.groups?.step;
  assert.ok(buildStep, 'production build step missing');
  for (const binding of [
    'NEXT_PUBLIC_APP_ENV: production',
    'NEXT_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}',
    'NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.SUPABASE_PUBLISHABLE_KEY }}',
    'EXPO_PUBLIC_APP_ENV: production',
    'EXPO_PUBLIC_SUPABASE_URL: ${{ secrets.SUPABASE_URL }}',
    'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: ${{ secrets.SUPABASE_PUBLISHABLE_KEY }}',
    'EAS_PROJECT_ID: ${{ vars.EAS_PROJECT_ID }}',
    'SALLAH_IOS_BUNDLE_ID: ${{ vars.SALLAH_IOS_BUNDLE_ID }}',
    'SALLAH_ANDROID_PACKAGE: ${{ vars.SALLAH_ANDROID_PACKAGE }}',
    'SALLAH_ANDROID_GOOGLE_MAPS_API_KEY: ${{ secrets.SALLAH_ANDROID_GOOGLE_MAPS_API_KEY }}',
  ]) {
    assert.ok(buildStep.includes(binding), binding);
  }
  assert.doesNotMatch(
    buildStep,
    /UPLOAD_SCANNER_(?:CONTROL|ATTESTATION)_SECRET|SUPABASE_SECRET_KEY/u,
  );
});

test('integration harness targets only the V2 pull/control data plane', async () => {
  const harness = await source('scripts/test-media-scanner-supabase.mjs');
  for (const evidence of [
    'queued-replay',
    'active-replay',
    'clean-replay',
    'terminal-replay',
    'clean-response-loss',
    'output-response-loss',
    'distinct-retry-artifacts',
    'old-attempt-orphan',
    'stale-worker',
    'one-winner-completion',
    'cleanup-versus-active',
    'scanner-hmac-replay',
    'signed-input',
    'signed-output',
    'signed-readback',
    'real-eicar',
    'fresh-signature',
    'stale-signature',
    'near-20mib-static-image',
    'pdf-fail-closed',
    'real-m4a-clean',
    'real-mp4-audio-clean',
    'real-mp4-video-clean',
    'malformed-audio-video-fail-closed',
    'polyglot-fail-closed',
    'autonomous-24h-storage-cleanup',
    'protected-broker-authorization',
    'residue-equality',
  ]) {
    assert.match(harness, new RegExp(`['\"]${evidence}['\"]`, 'u'), evidence);
  }
  assert.doesNotMatch(harness, /\/v1\/scan|UPLOAD_SCANNER_URL|buildScannerHeaders|gatewaySecret/u);
  assert.doesNotMatch(harness, /response\.clone\(\)\.text|scanner-control \$\{action/u);
});

test('root scripts expose a deterministic workflow gate and the real integration', async () => {
  const packageJson = JSON.parse(await source('package.json'));
  const validationBuild = await source('scripts/run-validation-build.mjs');
  assert.equal(
    packageJson.scripts['test:media-scanner:gates'],
    'node --test scripts/test-media-scanner-ci.test.mjs',
  );
  assert.equal(
    packageJson.scripts['test:edge-memory'],
    'node --test scripts/test-edge-memory.test.mjs',
  );
  assert.equal(
    packageJson.scripts['test:media-scanner:supabase'],
    'node scripts/test-media-scanner-supabase.mjs',
  );
  assert.match(packageJson.scripts.validate, /test:media-scanner:gates/u);
  assert.equal(packageJson.scripts['build:validate'], 'node scripts/run-validation-build.mjs');
  assert.match(packageJson.scripts.validate, /pnpm build:validate$/u);
  for (const variable of ['APP_ENV', 'NEXT_PUBLIC_APP_ENV', 'EXPO_PUBLIC_APP_ENV']) {
    assert.match(validationBuild, new RegExp(`${variable}: ['"]test['"]`, 'u'));
  }
});
