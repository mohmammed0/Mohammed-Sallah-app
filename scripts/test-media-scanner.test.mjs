import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { CleanupStack, resolveComposeCommand } from './test-media-scanner.mjs';

const repositoryRoot = new URL('../', import.meta.url);

async function source(path) {
  return await readFile(new URL(path, repositoryRoot), 'utf8');
}

function serviceBlock(compose, name, nextName) {
  const end = nextName ? `(?=\\n  ${nextName}:)` : '(?=\\nnetworks:)';
  return new RegExp(`\\n  ${name}:\\n(?<service>[\\s\\S]*?)${end}`, 'u').exec(compose)?.groups
    ?.service;
}

function assertWorkerHardening(compose) {
  const worker = serviceBlock(compose, 'worker');
  assert.ok(worker, 'worker service missing');
  assert.doesNotMatch(worker, /\bports:|\bexpose:/u);
  assert.doesNotMatch(
    worker,
    /SUPABASE_(?:SECRET|SERVICE_ROLE|PUBLISHABLE)|DATABASE_URL|POSTGRES_PASSWORD|S3_ACCESS_KEY|AWS_ACCESS_KEY_ID|\bJWT\b/u,
  );
  assert.match(worker, /mem_limit:\s*1g/u);
  assert.match(worker, /memswap_limit:\s*1g/u);
  assert.match(worker, /networks:\s*\[scanner-private, worker-egress\]/u);
  assert.match(worker, /UPLOAD_SCANNER_MAX_CONCURRENT_JOBS:\s*['"]?1['"]?/u);
  assert.match(worker, /UPLOAD_SCANNER_JOB_DEADLINE_SECONDS:\s*['"]?120['"]?/u);
}

test('prefers the Docker Compose CLI plugin and never asks a shell to resolve it', () => {
  const probes = [];
  const resolved = resolveComposeCommand((command, args) => {
    probes.push([command, args]);
    return command === 'docker' && args.join(' ') === 'compose version';
  });
  assert.deepEqual(resolved, { command: 'docker', prefixArgs: ['compose'] });
  assert.deepEqual(probes, [['docker', ['compose', 'version']]]);
});

test('falls back to docker-compose and fails closed when neither portable form exists', () => {
  assert.deepEqual(
    resolveComposeCommand((command) => command === 'docker-compose'),
    {
      command: 'docker-compose',
      prefixArgs: [],
    },
  );
  assert.throws(() => resolveComposeCommand(() => false), /DOCKER_COMPOSE_REQUIRED/u);
});

test('Compose runs a pull worker with no inbound or host media port', async () => {
  const compose = await source('infra/media-scanner/compose.yaml');
  const worker = serviceBlock(compose, 'worker');
  assert.ok(worker, 'worker service missing');
  assert.doesNotMatch(compose, /\bgateway:/u);
  assert.doesNotMatch(worker, /\bports:/u);
  assert.doesNotMatch(worker, /\bexpose:/u);
  assert.doesNotMatch(compose, /19191|\/v1\/scan|start-gateway/u);
  assert.match(worker, /command:\s*\['node', 'start-worker\.mjs'\]/u);
  assert.match(worker, /UPLOAD_SCANNER_MAX_CONCURRENT_JOBS:\s*['"]?1['"]?/u);
  assert.match(worker, /UPLOAD_SCANNER_JOB_DEADLINE_SECONDS:\s*['"]?120['"]?/u);
});

test('Compose represents Edge, worker/native, and ClamD budgets separately', async () => {
  const compose = await source('infra/media-scanner/compose.yaml');
  const clamd = serviceBlock(compose, 'clamd', 'worker');
  const worker = serviceBlock(compose, 'worker');
  assert.ok(clamd && worker);
  assert.match(compose, /x-sallah-resource-budgets:/u);
  assert.match(compose, /edge_metadata_limit_mib:\s*256/u);
  assert.match(compose, /edge_acceptance_peak_mib:\s*128/u);
  assert.match(compose, /worker_acceptance_peak_mib:\s*768/u);
  assert.match(clamd, /mem_limit:\s*4g/u);
  assert.match(clamd, /cpus:\s*2(?:\.0)?/u);
  assert.match(worker, /mem_limit:\s*1g/u);
  assert.match(worker, /memswap_limit:\s*1g/u);
  assert.match(worker, /cpus:\s*2(?:\.0)?/u);
  assert.match(worker, /\/tmp\/scanner:rw,noexec,nosuid,nodev,size=256m/u);
  assert.match(worker, /NODE_OPTIONS:\s*--max-old-space-size=256/u);
  assert.match(worker, /MALLOC_ARENA_MAX:\s*['"]?2['"]?/u);
  assert.match(worker, /RAYON_NUM_THREADS:\s*['"]?1['"]?/u);
  assert.match(worker, /UV_THREADPOOL_SIZE:\s*['"]?1['"]?/u);
});

test('hardening mutation probes detect ports, broad credentials, resource drift, and lost private network', async () => {
  const compose = await source('infra/media-scanner/compose.yaml');
  assertWorkerHardening(compose);
  const mutations = [
    [
      'host port',
      compose.replace("    command: ['node', 'start-worker.mjs']", "    ports: ['19191:19191']"),
    ],
    [
      'broad credential',
      compose.replace('    environment:', '    environment:\n      SUPABASE_SECRET_KEY: leaked'),
    ],
    [
      'worker memory',
      compose.replace(
        '    mem_limit: 1g\n    memswap_limit: 1g\n    cpus: 2.0',
        '    mem_limit: 2g\n    memswap_limit: 2g\n    cpus: 2.0',
      ),
    ],
    [
      'private network',
      compose.replace(
        '    networks: [scanner-private, worker-egress]',
        '    networks: [worker-egress]',
      ),
    ],
  ];
  for (const [name, mutation] of mutations) {
    assert.throws(() => assertWorkerHardening(mutation), undefined, name);
  }
});

test('ClamD is private, persistent, and sized for one job plus reload headroom', async () => {
  const [compose, clamd] = await Promise.all([
    source('infra/media-scanner/compose.yaml'),
    source('infra/media-scanner/clamd.conf'),
  ]);
  const daemon = serviceBlock(compose, 'clamd', 'worker');
  const worker = serviceBlock(compose, 'worker');
  assert.ok(daemon && worker);
  assert.match(compose, /scanner-private:\n\s+internal:\s*true/u);
  assert.match(daemon, /scanner-private/u);
  assert.match(worker, /scanner-private/u);
  assert.doesNotMatch(compose, /3310:3310/u);
  assert.match(daemon, /clamav-db:\/var\/lib\/clamav/u);
  assert.match(compose, /freshclam[^\n]*--log=\/tmp\/freshclam\.log/u);
  assert.match(clamd, /^StreamMaxLength 20M$/mu);
  assert.match(clamd, /^MaxThreads 2$/mu);
  assert.match(clamd, /^MaxConnectionQueueLength 2$/mu);
  assert.match(clamd, /^MaxQueue 2$/mu);
  assert.match(clamd, /^MaxScanTime 120000$/mu);
  assert.match(clamd, /^ExitOnOOM yes$/mu);
});

test('worker receives only exact control-plane configuration and two dedicated secrets', async () => {
  const [compose, adapter] = await Promise.all([
    source('infra/media-scanner/compose.yaml'),
    source('infra/media-scanner/start-worker.mjs'),
  ]);
  const worker = serviceBlock(compose, 'worker');
  assert.ok(worker);
  for (const forbidden of [
    'SUPABASE_SECRET_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'SUPABASE_PUBLISHABLE_KEY',
    'DATABASE_URL',
    'POSTGRES_PASSWORD',
    'S3_ACCESS_KEY',
    'AWS_ACCESS_KEY_ID',
    'JWT',
  ]) {
    assert.doesNotMatch(worker, new RegExp(forbidden, 'u'));
    assert.doesNotMatch(adapter, new RegExp(forbidden, 'u'));
  }
  assert.match(worker, /scanner-control-secret/u);
  assert.match(worker, /scanner-attestation-secret/u);
  assert.match(adapter, /\/run\/secrets\/scanner-control-secret/u);
  assert.match(adapter, /\/run\/secrets\/scanner-attestation-secret/u);
  assert.match(adapter, /APP_ENV/u);
  assert.match(adapter, /UPLOAD_SCANNER_CONTROL_ORIGIN/u);
  assert.match(adapter, /UPLOAD_SCANNER_STORAGE_ORIGIN/u);
  assert.match(adapter, /UPLOAD_SCANNER_SIGNATURE_MAX_AGE_HOURS/u);
  assert.match(adapter, /UPLOAD_SCANNER_JOB_DEADLINE_SECONDS/u);
  assert.doesNotMatch(adapter, /\?\?\s*['"]local['"]|default\(['"]local['"]\)/u);
});

test('container sources are immutable and runtime contains no push server', async () => {
  const [compose, dockerfile] = await Promise.all([
    source('infra/media-scanner/compose.yaml'),
    source('infra/media-scanner/worker.Dockerfile'),
  ]);
  assert.match(
    compose,
    /clamav\/clamav:1\.4\.6@sha256:e6444f72de025a3d57e2820dd1ad9f8734d1d4d6ab0e3336cdeb09fa2ba2f122/u,
  );
  assert.match(
    dockerfile,
    /node:24\.19\.0-bookworm-slim@sha256:65932751ed4073ed02f5c04e494e4b2572a891b7dbea0568a863dc80341bf848/u,
  );
  assert.match(dockerfile, /snapshot\.debian\.org\/archive\/debian\/20260823T000000Z/u);
  assert.match(dockerfile, /ffmpeg=7:5\.1\.9-0\+deb12u1/u);
  assert.match(dockerfile, /\/opt\/sallah-media\/bin\/ffmpeg/u);
  assert.match(dockerfile, /\/opt\/sallah-media\/bin\/ffprobe/u);
  assert.match(dockerfile, /^USER 65532:65532$/mu);
  assert.match(dockerfile, /deploy --legacy --prod --ignore-scripts/u);
  assert.doesNotMatch(dockerfile, /^EXPOSE\b/mu);
  assert.doesNotMatch(dockerfile, /start-gateway|server\.js|body\.js|ebml\.js|iso-bmff\.js/u);
  assert.doesNotMatch(dockerfile, /curl\s+[^\n]*\|\s*(?:sh|bash)|ADD\s+https?:/u);
  assert.doesNotMatch(dockerfile, /ENV\s+[^\n]*(?:SECRET|TOKEN|PASSWORD|KEY)/iu);
});

test('machine-readable OSS inventory includes exact image, native, and SBOM evidence', async () => {
  const [inventoryText, humanInventory, evaluation, notices, generator] = await Promise.all([
    source('oss-inventory.json'),
    source('docs/oss/OSS_INVENTORY.md'),
    source('docs/oss/OSS_EVALUATION.md'),
    source('THIRD_PARTY_NOTICES.md'),
    source('scripts/generate-container-sbom.mjs'),
  ]);
  const inventory = JSON.parse(inventoryText);
  const containers = inventory.containerComponents;
  assert.ok(Array.isArray(containers), 'containerComponents missing');
  assert.deepEqual(
    containers.map(({ component, version, digest, license }) => ({
      component,
      version,
      digest,
      license,
    })),
    [
      {
        component: 'clamav/clamav',
        version: '1.4.6',
        digest: 'sha256:e6444f72de025a3d57e2820dd1ad9f8734d1d4d6ab0e3336cdeb09fa2ba2f122',
        license: 'GPL-2.0-only',
      },
      {
        component: 'library/node',
        version: '24.19.0-bookworm-slim',
        digest: 'sha256:65932751ed4073ed02f5c04e494e4b2572a891b7dbea0568a863dc80341bf848',
        license: 'MIT',
      },
    ],
  );
  assert.match(inventoryText, /@napi-rs\/image-linux-x64-gnu/u);
  assert.match(inventoryText, /container-sbom\.cdx\.json/u);
  assert.match(inventoryText, /hosted activation.*NOT RUN/iu);
  assert.match(generator, /entry\.integrity/u);
  assert.match(generator, /sallah:package-integrity/u);
  assert.match(generator, /\[['"]image['"],\s*['"]inspect['"]/u);
  assert.match(generator, /dpkg-query/u);
  assert.match(generator, /\/lib\/apk\/db\/installed/u);
  assert.match(generator, /sallah:worker-image-id/u);
  assert.match(generator, /sallah:image-scope/u);
  for (const document of [humanInventory, evaluation, notices]) {
    assert.match(document, /ClamAV 1\.4\.6/u);
    assert.match(document, /GPL-2\.0-only/u);
    assert.match(document, /Node 24\.19\.0|Node\.js 24\.19\.0/u);
    assert.match(document, /hosted activation.*NOT RUN/iu);
    assert.match(document, /legal.*approval/iu);
    assert.match(document, /FFmpeg 5\.1\.9/iu);
    assert.match(document, /LGPL|GPL/iu);
    assert.match(document, /hosted activation.*NOT RUN/iu);
  }
  assert.match(inventoryText, /"component": "FFmpeg"/u);
  assert.match(inventoryText, /"version": "5\.1\.9-0\+deb12u1"/u);
  assert.doesNotMatch(inventoryText, /"component": "FFmpeg"[\s\S]{0,300}"status": "Rejected/iu);
});

test('container harness requires real EICAR, freshness, max-image, remux, cgroup, cleanup, and history probes', async () => {
  const [containerHarness, probe, remuxHarness, remuxProbe] = await Promise.all([
    source('scripts/test-media-scanner.mjs'),
    source('infra/media-scanner/container-probe.mjs'),
    source('scripts/test-media-scanner-remux.mjs'),
    source('infra/media-scanner/remux-probe.mjs'),
  ]);
  const harness = `${containerHarness}\n${remuxHarness}\n${remuxProbe}`;
  for (const flag of [
    'real-eicar',
    'stale-signature',
    'missing-signature',
    'unparseable-signature',
    'future-signature',
    'reload-window',
    'max-image',
    'near-max-bytes-png',
    'near-max-pixels-jpeg',
    'near-max-pixels-png',
    'near-max-pixels-webp',
    'sequential-high-entropy-webp',
    'cgroup-memory',
    'temp-cleanup',
    'image-history',
    'container-sbom',
    'real-m4a-remux',
    'real-mp4-audio-remux',
    'real-mp4-video-remux',
    'remux-metadata-stripped',
    'remux-trailing-payload-rejected',
  ]) {
    assert.match(harness, new RegExp(flag, 'u'));
  }
  assert.match(harness, /docker[\s\S]*compose/u);
  assert.match(harness, /function dockerCommand\(compose, args\)/u);
  assert.match(harness, /CONTAINER_SBOM_IMAGE_MISMATCH/u);
  assert.match(harness, /componentCount/u);
  assert.match(harness, /WORKER_ACCEPTANCE_PEAK_BYTES/u);
  assert.match(harness, /SALLAH_MEDIA_SCANNER_SIGNATURE_MODE/u);
  assert.match(harness, /Sallah\.Ci\.Freshness\.Overlay/u);
  assert.doesNotMatch(harness, /Sallah\.Test\.Eicar/u);
  assert.doesNotMatch(
    harness,
    /58354f2150254041505b345c505a58353428505e2937434329377d244549434152/u,
  );
  assert.match(harness, /signatureMode/u);
  assert.match(harness, /SEQUENTIAL_WEBP_JOB_COUNT\s*=\s*3/u);
  assert.match(harness, /distinctChildPids/u);
  assert.match(harness, /childrenAfter/u);
  assert.match(harness, /residueAfter/u);
  assert.match(harness, /cgroupObservedPeak/u);
  assert.match(harness, /maximums/u);
  assert.match(harness, /cgroupSwapLimit\s*!==\s*0/u);
  assert.doesNotMatch(harness, /runProcess\(\s*['"]docker['"]/u);
  assert.doesNotMatch(harness, /shell:\s*true/u);
  assert.doesNotMatch(harness, /\/v1\/scan|outputBase64|buildScannerHeaders/u);
  assert.match(probe, /new AttemptDeadline\(\{\s*processingDeadline:/u);
  assert.match(probe, /MAX_PIXEL_WIDTH\s*=\s*8_192/u);
  assert.match(probe, /MAX_PIXEL_HEIGHT\s*=\s*4_882/u);
  assert.match(probe, /memory\.swap\.max/u);
  assert.match(probe, /sequential-high-entropy-webp/u);
  assert.match(probe, /directChildren/u);
  assert.match(probe, /childPeakRss/u);
  assert.match(probe, /cgroupObservedPeak/u);
  assert.match(probe, /for \(let job = 1; job <= 3; job \+= 1\)/u);
  assert.match(probe, /result\.detectedSignature\s*!==\s*['"]Eicar-Test-Signature['"]/u);
  assert.match(probe, /detectedSignature:\s*real\.detectedSignature/u);
  for (const format of ['jpeg', 'png', 'webp']) {
    assert.match(probe, new RegExp(`near-max-pixels-${format}`, 'u'));
  }
});

test('cleanup remains deterministic LIFO and reports one safe category', async () => {
  const events = [];
  const cleanup = new CleanupStack();
  cleanup.defer(async () => events.push('first'));
  cleanup.defer(async () => {
    events.push('second');
    throw new Error('private cleanup detail');
  });
  cleanup.defer(async () => events.push('third'));
  await assert.rejects(cleanup.run(), /MEDIA_SCANNER_CLEANUP_FAILED/u);
  assert.deepEqual(events, ['third', 'second', 'first']);
});
