import { spawn, spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { chmod, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const composeFile = join(repositoryRoot, 'infra', 'media-scanner', 'compose.yaml');
const workerImage = 'sallah-media-scanner-worker:m2v-node24.19.0-image1.13.0';
const WORKER_MEMORY_BYTES = 1024 * 1024 * 1024;
const WORKER_ACCEPTANCE_PEAK_BYTES = 768 * 1024 * 1024;
const SEQUENTIAL_WEBP_JOB_COUNT = 3;
const sequentialProbeLabel = 'sequential-high-entropy-webp';
const maximumProbeLabels = [
  'near-max-bytes-png',
  'near-max-pixels-jpeg',
  'near-max-pixels-png',
  'near-max-pixels-webp',
];
const requiredProbeLabels = [
  'real-eicar',
  'stale-signature',
  'missing-signature',
  'unparseable-signature',
  'future-signature',
  'reload-window',
  'max-image',
  ...maximumProbeLabels,
  sequentialProbeLabel,
  'cgroup-memory',
  'temp-cleanup',
];
const evidenceLabels = ['image-history', 'container-sbom'];

function windowsToWslPath(value) {
  const match = /^([A-Za-z]):\\(.*)$/u.exec(value);
  if (!match?.[1] || match[2] === undefined) return null;
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll('\\', '/')}`;
}

function defaultProbe(command, args) {
  return (
    spawnSync(command, args, { shell: false, stdio: 'ignore', windowsHide: true }).status === 0
  );
}

export function resolveComposeCommand(probe = defaultProbe) {
  if (probe('docker', ['compose', 'version'])) {
    return { command: 'docker', prefixArgs: ['compose'] };
  }
  if (probe('docker-compose', ['version'])) {
    return { command: 'docker-compose', prefixArgs: [] };
  }
  if (process.platform === 'win32') {
    const wslCwd = windowsToWslPath(process.cwd());
    if (wslCwd && probe('wsl.exe', ['--cd', wslCwd, '-e', 'docker', 'compose', 'version'])) {
      return {
        command: 'wsl.exe',
        prefixArgs: ['--cd', wslCwd, '-e', 'docker', 'compose'],
      };
    }
  }
  throw new Error('DOCKER_COMPOSE_REQUIRED');
}

export class CleanupStack {
  #actions = [];
  #complete = false;

  defer(action) {
    if (this.#complete) throw new Error('MEDIA_SCANNER_CLEANUP_CLOSED');
    this.#actions.push(action);
  }

  async run() {
    if (this.#complete) return;
    this.#complete = true;
    let failed = false;
    for (const action of this.#actions.reverse()) {
      try {
        await action();
      } catch {
        failed = true;
      }
    }
    this.#actions = [];
    if (failed) throw new Error('MEDIA_SCANNER_CLEANUP_FAILED');
  }
}

function composePath(value, compose) {
  return compose.command === 'wsl.exe' ? (windowsToWslPath(value) ?? value) : value;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      shell: false,
      stdio: options.capture ? ['ignore', 'pipe', 'pipe'] : 'inherit',
      windowsHide: true,
      ...options,
    });
    let stdout = '';
    let stderr = '';
    child.stdout?.on('data', (chunk) => {
      stdout = `${stdout}${String(chunk)}`.slice(-128_000);
    });
    child.stderr?.on('data', (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-128_000);
    });
    child.once('error', () => rejectRun(new Error('MEDIA_SCANNER_PROCESS_FAILED')));
    child.once('exit', (code) => {
      if (code === 0) resolveRun({ stdout, stderr });
      else rejectRun(new Error('MEDIA_SCANNER_PROCESS_FAILED'));
    });
  });
}

function composeArgs(compose, projectName, args) {
  return [
    ...compose.prefixArgs,
    ...(compose.files ?? [composeFile]).flatMap((file) => ['--file', composePath(file, compose)]),
    '--project-name',
    projectName,
    ...args,
  ];
}

async function configureSignatureMode(compose, tempDirectory) {
  const mode = process.env.SALLAH_MEDIA_SCANNER_SIGNATURE_MODE ?? 'live';
  if (mode === 'live') return { ...compose, files: [composeFile], signatureMode: mode };
  if (mode !== 'deterministic') throw new Error('MEDIA_SCANNER_SIGNATURE_MODE_INVALID');
  const overrideFile = join(tempDirectory, 'compose.deterministic-signatures.yaml');
  const signature =
    'Sallah.Ci.Freshness.Overlay:0:*:53414c4c41482d43492d46524553484e4553532d4f5645524c4159';
  await writeFile(
    overrideFile,
    `services:\n  signature-update:\n    entrypoint: ['sh', '-lc']\n    command:\n      - |\n        set -eu\n        test -f /var/lib/clamav/main.cvd\n        rm -f /var/lib/clamav/daily.cvd /var/lib/clamav/daily.cld /var/lib/clamav/daily.cud\n        mkdir /tmp/deterministic-db\n        printf '%s\\n' '${signature}' > /tmp/deterministic-db/daily.ndb\n        printf 'Local CI-only freshness overlay; pinned main.cvd provides official EICAR detection.\\n' > /tmp/deterministic-db/COPYING\n        cd /tmp/deterministic-db\n        printf 'sallah-deterministic-ci\\n' | sigtool --build=daily --cvd-version=1 --unsigned --datadir=/tmp/deterministic-db >/dev/null\n        mv daily /var/lib/clamav/daily.cud\n`,
    { encoding: 'utf8', flag: 'wx', mode: 0o600 },
  );
  return { ...compose, files: [composeFile, overrideFile], signatureMode: mode };
}

function dockerCommand(compose, args) {
  if (compose.command === 'wsl.exe') {
    return {
      command: compose.command,
      args: [...compose.prefixArgs.slice(0, -2), 'docker', ...args],
    };
  }
  return { command: 'docker', args };
}

async function runCompose(compose, projectName, environment, args, options = {}) {
  return await runProcess(compose.command, composeArgs(compose, projectName, args), {
    env: environment,
    ...options,
  });
}

function scannerSecret(label) {
  return `${label}-${randomBytes(32).toString('hex')}`;
}

async function safeEnvironment(tempDirectory, compose) {
  const controlFile = join(tempDirectory, 'scanner-control-secret');
  const attestationFile = join(tempDirectory, 'scanner-attestation-secret');
  const controlSecret = scannerSecret('control');
  const attestationSecret = scannerSecret('attestation');
  await Promise.all([
    writeFile(controlFile, `${controlSecret}\n`, { encoding: 'utf8', flag: 'wx', mode: 0o400 }),
    writeFile(attestationFile, `${attestationSecret}\n`, {
      encoding: 'utf8',
      flag: 'wx',
      mode: 0o400,
    }),
  ]);
  await Promise.all([chmod(controlFile, 0o444), chmod(attestationFile, 0o444)]);
  const environment = {
    ...process.env,
    APP_ENV: 'local',
    UPLOAD_SCANNER_WORKER_ID: `local-probe-${process.pid}`,
    UPLOAD_SCANNER_CONTROL_ORIGIN: 'http://127.0.0.1:54321',
    UPLOAD_SCANNER_STORAGE_ORIGIN: 'http://127.0.0.1:54321',
    UPLOAD_SCANNER_SIGNATURE_MAX_AGE_HOURS: '168',
    SALLAH_SCANNER_CONTROL_SECRET_FILE: composePath(controlFile, compose),
    SALLAH_SCANNER_ATTESTATION_SECRET_FILE: composePath(attestationFile, compose),
  };
  if (compose.command === 'wsl.exe') {
    environment.WSLENV = [
      process.env.WSLENV,
      'APP_ENV/u',
      'UPLOAD_SCANNER_WORKER_ID/u',
      'UPLOAD_SCANNER_CONTROL_ORIGIN/u',
      'UPLOAD_SCANNER_STORAGE_ORIGIN/u',
      'UPLOAD_SCANNER_SIGNATURE_MAX_AGE_HOURS/u',
      'SALLAH_SCANNER_CONTROL_SECRET_FILE/u',
      'SALLAH_SCANNER_ATTESTATION_SECRET_FILE/u',
    ]
      .filter(Boolean)
      .join(':');
  }
  return { environment, secrets: [controlSecret, attestationSecret] };
}

function lastJsonLine(output) {
  for (const line of output.trim().split(/\r?\n/u).reverse()) {
    try {
      return JSON.parse(line);
    } catch {
      // Continue past Compose progress lines.
    }
  }
  throw new Error('MEDIA_SCANNER_PROBE_RESULT_MISSING');
}

async function inspectImageHistory(compose, secrets) {
  const historyCommand = dockerCommand(compose, [
    'image',
    'history',
    '--no-trunc',
    '--format',
    '{{.CreatedBy}}',
    workerImage,
  ]);
  const inspectCommand = dockerCommand(compose, ['image', 'inspect', workerImage]);
  const history = await runProcess(historyCommand.command, historyCommand.args, { capture: true });
  const inspection = await runProcess(inspectCommand.command, inspectCommand.args, {
    capture: true,
  });
  const evidence = `${history.stdout}\n${history.stderr}\n${inspection.stdout}\n${inspection.stderr}`;
  for (const secret of secrets) {
    if (evidence.includes(secret)) throw new Error('MEDIA_SCANNER_IMAGE_SECRET_LEAK');
  }
  if (/SUPABASE_(?:SECRET|SERVICE_ROLE)|DATABASE_URL|AWS_ACCESS_KEY_ID/u.test(evidence)) {
    throw new Error('MEDIA_SCANNER_IMAGE_BROAD_CREDENTIAL');
  }
  const inspected = JSON.parse(inspection.stdout)?.[0];
  if (!inspected || !/^sha256:[a-f0-9]{64}$/u.test(inspected.Id)) {
    throw new Error('MEDIA_SCANNER_IMAGE_DIGEST_INVALID');
  }
  return inspected.Id;
}

async function verifyContainerSbom(imageId) {
  const sbom = JSON.parse(
    await readFile(join(repositoryRoot, 'artifacts', 'container-sbom.cdx.json'), 'utf8'),
  );
  const recordedImage = sbom.metadata?.component?.properties?.find(
    (entry) => entry.name === 'sallah:worker-image-id',
  )?.value;
  if (recordedImage !== imageId) throw new Error('CONTAINER_SBOM_IMAGE_MISMATCH');
  const components = Array.isArray(sbom.components) ? sbom.components : [];
  const counts = {
    workerOs: components.filter((entry) => entry.group === 'debian').length,
    clamavOs: components.filter((entry) => entry.group === 'alpine').length,
    workerApplication: components.filter((entry) => entry.group === 'npm').length,
  };
  const dependencies = sbom.dependencies?.[0]?.dependsOn;
  if (
    components.length < 100 ||
    counts.workerOs < 80 ||
    counts.clamavOs < 30 ||
    counts.workerApplication < 4 ||
    !Array.isArray(dependencies) ||
    dependencies.length !== components.length
  ) {
    throw new Error('CONTAINER_SBOM_COVERAGE_INCOMPLETE');
  }
  return { imageId, componentCount: components.length, ...counts };
}

async function runIntegration() {
  const resolvedCompose = resolveComposeCommand();
  const cleanup = new CleanupStack();
  const tempDirectory = await mkdtemp(join(tmpdir(), 'sallah-media-scanner-v2-'));
  cleanup.defer(async () => await rm(tempDirectory, { recursive: true, force: true }));
  const compose = await configureSignatureMode(resolvedCompose, tempDirectory);
  const projectName = `sallah-media-scanner-v2-${process.pid}`.toLowerCase();
  const { environment, secrets } = await safeEnvironment(tempDirectory, compose);

  try {
    await runCompose(compose, projectName, environment, ['config', '--quiet']);
    const effective = await runCompose(
      compose,
      projectName,
      environment,
      ['config', '--format', 'json'],
      { capture: true },
    );
    const parsed = JSON.parse(effective.stdout);
    if (parsed.services?.worker?.ports || parsed.services?.worker?.expose) {
      throw new Error('MEDIA_SCANNER_WORKER_PORT_EXPOSED');
    }
    await runCompose(compose, projectName, environment, ['build', '--pull', 'worker']);
    cleanup.defer(async () => {
      await runCompose(compose, projectName, environment, [
        'down',
        '--volumes',
        '--remove-orphans',
        '--timeout',
        '15',
      ]);
    });
    await runCompose(compose, projectName, environment, [
      'up',
      '--detach',
      '--wait',
      '--wait-timeout',
      '300',
      'clamd',
    ]);
    const probe = await runCompose(
      compose,
      projectName,
      environment,
      ['run', '--rm', '--no-deps', 'worker', 'node', 'container-probe.mjs', 'evidence'],
      { capture: true },
    );
    const evidenceResult = lastJsonLine(`${probe.stdout}\n${probe.stderr}`);
    const maximums = {};
    const maximumProbes = [];
    for (const label of maximumProbeLabels) {
      const maximumProbe = await runCompose(
        compose,
        projectName,
        environment,
        ['run', '--rm', '--no-deps', 'worker', 'node', 'container-probe.mjs', 'max-image', label],
        { capture: true },
      );
      const maximumResult = lastJsonLine(`${maximumProbe.stdout}\n${maximumProbe.stderr}`);
      if (maximumResult.status !== 'pass' || !maximumResult.probes?.includes(label)) {
        throw new Error('MEDIA_SCANNER_MAXIMUM_PROBE_FAILED');
      }
      maximums[label] = maximumResult.maximum;
      maximumProbes.push(...maximumResult.probes);
    }
    const result = {
      ...evidenceResult,
      probes: [...new Set([...evidenceResult.probes, ...maximumProbes])],
      maximum: maximums['near-max-bytes-png'],
      maximums,
    };
    const sequentialContainerName = `${projectName}-sequential`;
    const removeSequential = dockerCommand(compose, ['rm', '--force', sequentialContainerName]);
    cleanup.defer(async () => {
      await runProcess(removeSequential.command, removeSequential.args, { capture: true }).catch(
        () => undefined,
      );
    });
    const sequentialProbe = await runCompose(
      compose,
      projectName,
      environment,
      [
        'run',
        '--name',
        sequentialContainerName,
        '--no-deps',
        'worker',
        'node',
        'container-probe.mjs',
        sequentialProbeLabel,
      ],
      { capture: true },
    );
    const sequentialResult = lastJsonLine(`${sequentialProbe.stdout}\n${sequentialProbe.stderr}`);
    const inspectSequential = dockerCommand(compose, ['inspect', sequentialContainerName]);
    const sequentialInspection = JSON.parse(
      (await runProcess(inspectSequential.command, inspectSequential.args, { capture: true }))
        .stdout,
    )?.[0];
    if (
      sequentialResult.status !== 'pass' ||
      !sequentialResult.probes?.includes(sequentialProbeLabel) ||
      sequentialInspection?.State?.OOMKilled !== false ||
      sequentialInspection?.State?.ExitCode !== 0
    ) {
      throw new Error('MEDIA_SCANNER_SEQUENTIAL_PROBE_FAILED');
    }
    result.sequential = sequentialResult.sequential;
    result.probes.push(...sequentialResult.probes);
    result.probes = [...new Set(result.probes)];
    if (result.status !== 'pass') throw new Error('MEDIA_SCANNER_CONTAINER_PROBE_FAILED');
    for (const label of requiredProbeLabels) {
      if (!result.probes?.includes(label))
        throw new Error('MEDIA_SCANNER_CONTAINER_PROBE_INCOMPLETE');
    }
    for (const label of maximumProbeLabels) {
      const maximum = result.maximums[label];
      if (
        maximum?.cgroupMemoryLimit !== WORKER_MEMORY_BYTES ||
        maximum?.cgroupSwapLimit !== 0 ||
        maximum?.cgroupMemoryPeak > WORKER_ACCEPTANCE_PEAK_BYTES ||
        maximum?.durationMs >= 120_000 ||
        maximum?.inputBytes <= 0 ||
        maximum?.inputBytes > 20 * 1024 * 1024 ||
        maximum?.outputBytes <= 0 ||
        maximum?.outputBytes > 20 * 1024 * 1024
      ) {
        throw new Error('MEDIA_SCANNER_CONTAINER_BUDGET_FAILED');
      }
      if (label === 'near-max-bytes-png' && maximum.inputBytes <= 18 * 1024 * 1024) {
        throw new Error('MEDIA_SCANNER_BYTE_BOUNDARY_UNPROVEN');
      }
      if (
        label !== 'near-max-bytes-png' &&
        (maximum.width !== 8_192 || maximum.height !== 4_882 || maximum.pixelCount !== 39_993_344)
      ) {
        throw new Error('MEDIA_SCANNER_PIXEL_BOUNDARY_UNPROVEN');
      }
    }
    const sequential = result.sequential;
    const distinctChildPids = new Set(
      sequential?.jobs?.flatMap((job) => (Array.isArray(job.childPids) ? job.childPids : [])),
    );
    if (
      sequential?.jobs?.length !== SEQUENTIAL_WEBP_JOB_COUNT ||
      distinctChildPids.size !== SEQUENTIAL_WEBP_JOB_COUNT ||
      sequential?.distinctChildPids?.length !== SEQUENTIAL_WEBP_JOB_COUNT ||
      sequential?.cgroupMemoryLimit !== WORKER_MEMORY_BYTES ||
      sequential?.cgroupSwapLimit !== 0 ||
      sequential?.cgroupMemoryPeak > WORKER_ACCEPTANCE_PEAK_BYTES ||
      sequential?.oomKilled !== false ||
      sequential?.childrenAfter?.length !== 0 ||
      sequential?.residueAfter?.length !== 0
    ) {
      throw new Error('MEDIA_SCANNER_SEQUENTIAL_BUDGET_FAILED');
    }
    for (const job of sequential.jobs) {
      if (
        job.durationMs >= 120_000 ||
        job.inputBytes <= 14 * 1024 * 1024 ||
        job.inputBytes > 20 * 1024 * 1024 ||
        job.outputBytes <= 16 * 1024 * 1024 ||
        job.outputBytes <= job.inputBytes ||
        job.outputBytes > 20 * 1024 * 1024 ||
        job.childPids?.length !== 1 ||
        job.childrenAfter?.length !== 0 ||
        job.residueAfter?.length !== 0 ||
        job.cgroupObservedPeak > WORKER_ACCEPTANCE_PEAK_BYTES
      ) {
        throw new Error('MEDIA_SCANNER_SEQUENTIAL_JOB_FAILED');
      }
    }
    const imageId = await inspectImageHistory(compose, secrets);
    await runProcess(process.execPath, [
      join(repositoryRoot, 'scripts', 'generate-container-sbom.mjs'),
    ]);
    const sbom = await verifyContainerSbom(imageId);
    process.stdout.write(
      `${JSON.stringify({ ...result, evidence: evidenceLabels, image: workerImage, signatureMode: compose.signatureMode, sbom })}\n`,
    );
  } finally {
    await cleanup.run();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) await runIntegration();
