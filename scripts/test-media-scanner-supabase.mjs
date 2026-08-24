import { spawn } from 'node:child_process';
import { randomBytes, randomUUID } from 'node:crypto';
import { chmod, lstat, mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { fileURLToPath, pathToFileURL } from 'node:url';

import {
  createUser,
  ensureFunctions,
  expectOk,
  headers,
  invoke,
  localEnvironment,
  rpc,
  stopFunctions,
  storagePath,
} from './test-local-supabase.mjs';
import { resolveTool } from './resolve-tool.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const clamavImage =
  'clamav/clamav:1.4.6@sha256:e6444f72de025a3d57e2820dd1ad9f8734d1d4d6ab0e3336cdeb09fa2ba2f122';
const workerImage = 'sallah-media-scanner-worker:m2v-node24.19.0-image1.13.0';
const fixtureContainerPrefix = 'sallah-m2-fixture-';
const fixtureContainerNamePattern =
  /^sallah-m2-fixture-[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;
const fixtureCleanupDeadlineMs = 5_000;
const fixtureCleanupQuietPeriodMs = 500;
const eicar = Buffer.from(
  ['X5O!P%@AP[4\\PZX54(P^)7CC)7}$', 'EICAR', '-STANDARD-ANTIVIRUS-TEST-FILE!$H+H*'].join(''),
  'ascii',
);
const onePixelPng = Uint8Array.from(
  Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=',
    'base64',
  ),
);
const requiredEvidence = [
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
];

function fail(category) {
  throw new Error(category);
}

function windowsToWslPath(value) {
  const match = /^([A-Za-z]):\\(.*)$/u.exec(value);
  if (!match?.[1] || match[2] === undefined) return value;
  return `/mnt/${match[1].toLowerCase()}/${match[2].replaceAll('\\', '/')}`;
}

function runProcess(command, args, options = {}) {
  return new Promise((resolveRun, rejectRun) => {
    const child = spawn(command, args, {
      cwd: repositoryRoot,
      env: options.env ?? process.env,
      shell: options.shell ?? false,
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
    });
    let stdout = '';
    let stderr = '';
    let spawnError;
    let timedOut = false;
    let externallyAborted = false;
    const terminate = () => {
      if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL');
    };
    const abort = () => {
      externallyAborted = true;
      terminate();
    };
    options.signal?.addEventListener('abort', abort, { once: true });
    if (options.signal?.aborted) abort();
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          terminate();
        }, options.timeoutMs)
      : undefined;
    child.stdout.on('data', (chunk) => {
      stdout = `${stdout}${String(chunk)}`.slice(-256_000);
    });
    child.stderr.on('data', (chunk) => {
      stderr = `${stderr}${String(chunk)}`.slice(-256_000);
    });
    child.once('error', (cause) => {
      spawnError = cause;
    });
    child.once('close', (code) => {
      if (timer) clearTimeout(timer);
      options.signal?.removeEventListener('abort', abort);
      if (timedOut) {
        rejectRun(new Error(`M2_INTEGRATION_PROCESS_TIMEOUT:${options.label ?? command}`));
        return;
      }
      if (externallyAborted) {
        rejectRun(new Error(`M2_INTEGRATION_PROCESS_ABORTED:${options.label ?? command}`));
        return;
      }
      if (spawnError) {
        rejectRun(
          Object.assign(new Error('M2_INTEGRATION_PROCESS_FAILED', { cause: spawnError }), {
            stderr,
            stdout,
          }),
        );
        return;
      }
      if (code === 0 || options.acceptCodes?.includes(code)) {
        resolveRun({ code, stdout, stderr });
      } else {
        rejectRun(
          Object.assign(new Error(`M2_INTEGRATION_PROCESS_FAILED:${options.label ?? command}`), {
            exitCode: code,
            stderr,
            stdout,
          }),
        );
      }
    });
  });
}

async function runTool(tool, args, options = {}) {
  const resolved = resolveTool(tool, args);
  return await runProcess(resolved.command, resolved.args, {
    ...options,
    label: options.label ?? tool,
    shell: resolved.shell,
  });
}

async function runDocker(args, options = {}) {
  if (process.platform === 'win32') {
    return await runProcess(
      'wsl.exe',
      ['--cd', windowsToWslPath(repositoryRoot), '-e', 'docker', ...args],
      options,
    );
  }
  return await runProcess('docker', args, options);
}

function containerPath(hostRoot, value) {
  if (value === hostRoot) return '/work';
  if (!value.startsWith(`${hostRoot}\\`) && !value.startsWith(`${hostRoot}/`)) return value;
  return `/work/${value.slice(hostRoot.length + 1).replaceAll('\\', '/')}`;
}

function boundedProcessDetail(value, redactions) {
  let detail = String(value ?? '').slice(-4_096);
  for (const redaction of redactions) {
    if (redaction) detail = detail.replaceAll(redaction, '<fixture-root>');
  }
  return detail.replaceAll(/\s+/gu, ' ').trim() || 'unavailable';
}

async function workerMountGroupArgs(hostRoot) {
  if (process.platform === 'win32') return [];
  const before = await lstat(hostRoot);
  if (!before.isDirectory() || before.isSymbolicLink()) {
    fail('M2_FIXTURE_MOUNT_INVALID');
  }
  if (typeof process.getuid === 'function' && before.uid !== process.getuid()) {
    fail('M2_FIXTURE_MOUNT_OWNER_INVALID');
  }
  await chmod(hostRoot, 0o770);
  const after = await stat(hostRoot);
  if ((after.mode & 0o007) !== 0 || (after.mode & 0o070) !== 0o070) {
    fail('M2_FIXTURE_MOUNT_MODE_INVALID');
  }
  return ['--group-add', String(after.gid)];
}

async function matchingFixtureWorkerContainers(containerName) {
  const result = await runDocker(
    [
      'container',
      'ls',
      '--all',
      '--format',
      '{{.Names}}',
      '--filter',
      `name=^/${containerName ? containerName : fixtureContainerPrefix}`,
    ],
    { label: 'fixture-container-list', timeoutMs: 2_000 },
  );
  return result.stdout
    .split(/\r?\n/gu)
    .map((value) => value.trim())
    .filter((value) =>
      containerName ? value === containerName : value.startsWith(fixtureContainerPrefix),
    );
}

async function removeFixtureWorkerContainer(containerName) {
  const deadline = Date.now() + fixtureCleanupDeadlineMs;
  let absentSince;
  while (Date.now() < deadline) {
    const remainingMs = Math.max(1, deadline - Date.now());
    await runDocker(['rm', '--force', containerName], {
      acceptCodes: [1],
      label: 'fixture-container-timeout-cleanup',
      timeoutMs: Math.min(2_000, remainingMs),
    });
    const matches = await matchingFixtureWorkerContainers(containerName);
    if (matches.length === 0) {
      absentSince ??= Date.now();
      if (Date.now() - absentSince >= fixtureCleanupQuietPeriodMs) return;
    } else {
      absentSince = undefined;
    }
    await delay(Math.min(100, Math.max(1, deadline - Date.now())));
  }
  fail('M2_FIXTURE_CONTAINER_CLEANUP_FAILED');
}

export async function listFixtureWorkerContainers(containerName) {
  if (!fixtureContainerNamePattern.test(containerName)) fail('M2_FIXTURE_CONTAINER_NAME_INVALID');
  return await matchingFixtureWorkerContainers(containerName);
}

async function runWorkerImageCommand(hostRoot, executable, args, options = {}) {
  const mountRoot = process.platform === 'win32' ? windowsToWslPath(hostRoot) : hostRoot;
  const label = options.label ?? 'worker-image-command';
  const containerName = `${fixtureContainerPrefix}${randomUUID()}`;
  const groupArgs = await workerMountGroupArgs(hostRoot);
  const controller = new AbortController();
  let timedOut = false;
  const abort = () => controller.abort();
  options.signal?.addEventListener('abort', abort, { once: true });
  if (options.signal?.aborted) abort();
  const timer = options.timeoutMs
    ? setTimeout(() => {
        timedOut = true;
        controller.abort();
      }, options.timeoutMs)
    : undefined;
  let result;
  try {
    result = await runDocker(
      [
        'run',
        '--rm',
        '--name',
        containerName,
        '--read-only',
        '--network',
        'none',
        '--cap-drop',
        'ALL',
        '--security-opt',
        'no-new-privileges:true',
        '--pids-limit',
        '32',
        '--memory',
        '512m',
        '--memory-swap',
        '512m',
        '--cpus',
        '1',
        '--tmpfs',
        '/tmp/scanner:rw,noexec,nosuid,nodev,size=128m,uid=65532,gid=65532,mode=0700',
        '--user',
        '65532:65532',
        ...groupArgs,
        '--volume',
        `${mountRoot}:/work:${options.readOnlyMount ? 'ro' : 'rw'}`,
        '--entrypoint',
        executable,
        workerImage,
        ...args.map((value) => containerPath(hostRoot, value)),
      ],
      { label, signal: controller.signal },
    );
  } catch (error) {
    if (controller.signal.aborted) {
      await removeFixtureWorkerContainer(containerName);
    }
    if (timedOut) {
      throw Object.assign(new Error(`M2_INTEGRATION_PROCESS_TIMEOUT:${label}`), {
        fixtureContainerName: containerName,
      });
    }
    const exit = Number.isInteger(error?.exitCode) ? error.exitCode : 'spawn';
    const detail = boundedProcessDetail(error?.stderr ?? error?.cause?.message, [
      mountRoot,
      hostRoot,
      repositoryRoot,
    ]);
    throw new Error(`M2_INTEGRATION_PROCESS_FAILED:${label}:exit=${exit}:stderr=${detail}`);
  } finally {
    if (timer) clearTimeout(timer);
    options.signal?.removeEventListener('abort', abort);
  }
  if (
    Buffer.byteLength(result.stdout) > (options.maxStdoutBytes ?? 64 * 1024) ||
    Buffer.byteLength(result.stderr) > (options.maxStderrBytes ?? 64 * 1024)
  ) {
    fail('M2_REMUX_CONTROL_OUTPUT_OVERSIZED');
  }
  return result;
}

export async function runFixtureWorkerCommand(hostRoot, executable, args, options = {}) {
  return await runWorkerImageCommand(hostRoot, executable, args, options);
}

function createContainerRemuxRunner(hostRoot) {
  return async (command) => {
    const result = await runWorkerImageCommand(hostRoot, command.executable, command.args, {
      label: 'media-remux-command',
      signal: command.signal,
      maxStdoutBytes: command.maxStdoutBytes,
      maxStderrBytes: command.maxStderrBytes,
    });
    return { stdout: result.stdout, stderr: result.stderr };
  };
}

async function reserveLoopbackPort() {
  return await new Promise((resolvePort, rejectPort) => {
    const server = createServer();
    server.once('error', () => rejectPort(new Error('M2_LOOPBACK_PORT_UNAVAILABLE')));
    server.listen(0, '127.0.0.1', () => {
      const address = server.address();
      if (!address || typeof address === 'string') {
        server.close();
        rejectPort(new Error('M2_LOOPBACK_PORT_UNAVAILABLE'));
        return;
      }
      server.close((error) =>
        error ? rejectPort(new Error('M2_LOOPBACK_PORT_UNAVAILABLE')) : resolvePort(address.port),
      );
    });
  });
}

async function sql(query) {
  const result = await runDocker(
    [
      'exec',
      'supabase_db_sallah',
      'psql',
      '-X',
      '-qAt',
      '-v',
      'ON_ERROR_STOP=1',
      '-U',
      'postgres',
      '-d',
      'postgres',
      '-c',
      query,
    ],
    { label: 'local-postgres' },
  );
  return result.stdout.trim();
}

async function sqlJson(query) {
  const value = await sql(query);
  try {
    return JSON.parse(value);
  } catch {
    fail('M2_LOCAL_SQL_RESULT_INVALID');
  }
}

async function resetLocalSupabase() {
  await runTool('supabase', ['db', 'reset'], { label: 'supabase-db-reset' });
}

async function residueSnapshot() {
  return await sqlJson(`select jsonb_build_object(
    'users',(select count(*) from auth.users),
    'uploads',(select count(*) from public.file_uploads),
    'jobs',(select count(*) from private.media_scan_jobs),
    'attempts',(select count(*) from private.media_scan_attempts),
    'artifacts',(select count(*) from private.media_scan_artifacts),
    'attestations',(select count(*) from private.media_scan_attestations),
    'events',(select count(*) from private.media_scan_events),
    'nonces',(select count(*) from private.media_scanner_nonces),
    'storageObjects',(select count(*) from storage.objects)
  )::text`);
}

async function buildDeterministicSignatureDatabase(directory) {
  const signature =
    'Sallah.Test.Eicar:0:*:58354f2150254041505b345c505a58353428505e2937434329377d2445494341522d5354414e444152442d414e544956495255532d544553542d46494c452124482b482a';
  await Promise.all([
    writeFile(join(directory, 'daily.ndb'), `${signature}\n`, { flag: 'wx', mode: 0o644 }),
    writeFile(join(directory, 'COPYING'), 'Local CI-only EICAR test signature.\n', {
      flag: 'wx',
      mode: 0o644,
    }),
  ]);
  await runDocker(
    [
      'run',
      '--rm',
      '--volume',
      `${windowsToWslPath(directory)}:/work`,
      '--entrypoint',
      'sh',
      clamavImage,
      '-lc',
      "cd /work && printf 'sallah-local-ci\\n' | sigtool --build=daily --cvd-version=1 --unsigned --datadir=/work >/dev/null && mv daily daily.cud && rm daily.ndb daily.info COPYING",
    ],
    { label: 'deterministic-clamav-signature' },
  );
}

async function startClamd(signatureDirectory, port) {
  const name = `sallah-m2v-clamd-${process.pid}-${randomBytes(4).toString('hex')}`;
  await runDocker(
    [
      'run',
      '--detach',
      '--name',
      name,
      '--read-only',
      '--user',
      '100:101',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges:true',
      '--pids-limit',
      '128',
      '--memory',
      '4g',
      '--cpus',
      '2',
      '--tmpfs',
      '/tmp:rw,noexec,nosuid,nodev,size=32m,uid=100,gid=101,mode=0750',
      '--publish',
      `127.0.0.1:${port}:3310`,
      '--volume',
      `${windowsToWslPath(signatureDirectory)}:/var/lib/clamav:ro`,
      '--volume',
      `${windowsToWslPath(join(repositoryRoot, 'infra', 'media-scanner', 'clamd.conf'))}:/etc/clamav/clamd-sallah.conf:ro`,
      '--entrypoint',
      'clamd',
      clamavImage,
      '--foreground=true',
      '--config-file=/etc/clamav/clamd-sallah.conf',
    ],
    { label: 'local-clamd-start' },
  );
  return name;
}

async function stopClamd(name) {
  await runDocker(['rm', '--force', name], {
    acceptCodes: [1],
    label: 'local-clamd-stop',
  });
}

async function writeFunctionEnvironment(directory, secrets, config) {
  const path = join(directory, 'edge.env');
  const text = [
    'APP_ENV=local',
    'UPLOAD_SCANNER_MODE=external',
    'UPLOAD_SCANNER_CONTROL_ORIGIN=http://127.0.0.1:54321',
    'UPLOAD_SCANNER_STORAGE_ORIGIN=http://127.0.0.1:54321',
    `UPLOAD_SCANNER_STORAGE_S3_ACCESS_KEY_ID=${config.s3AccessKeyId}`,
    `UPLOAD_SCANNER_STORAGE_S3_SECRET_ACCESS_KEY=${config.s3SecretAccessKey}`,
    `UPLOAD_SCANNER_STORAGE_S3_REGION=${config.s3Region}`,
    `UPLOAD_SCANNER_CONTROL_SECRET=${secrets.control}`,
    `UPLOAD_SCANNER_ATTESTATION_SECRET=${secrets.attestation}`,
    'UPLOAD_SCANNER_SIGNATURE_MAX_AGE_HOURS=168',
    `PRIVACY_WORKER_SECRET=${secrets.privacy}`,
  ].join('\n');
  await writeFile(path, `${text}\n`, { flag: 'wx', mode: 0o600 });
  await chmod(path, 0o600);
  return path;
}

async function uploadObject(config, user, bucket, path, bytes, contentType) {
  await expectOk(
    await fetch(`${config.apiUrl}/storage/v1/object/${bucket}/${storagePath(path)}`, {
      method: 'POST',
      headers: headers(config.publishableKey, user.token, {
        'content-type': contentType,
        'x-upsert': 'false',
      }),
      body: bytes,
    }),
    'quarantine-upload',
  );
}

async function uploadServiceObject(config, bucket, path, bytes, contentType) {
  await expectOk(
    await fetch(`${config.apiUrl}/storage/v1/object/${bucket}/${storagePath(path)}`, {
      method: 'POST',
      headers: headers(config.secretKey, config.secretKey, {
        'content-type': contentType,
        'x-upsert': 'false',
      }),
      body: bytes,
    }),
    'service-storage-upload',
  );
}

async function storageObjectExists(config, bucket, path) {
  const response = await fetch(
    `${config.apiUrl}/storage/v1/object/authenticated/${bucket}/${storagePath(path)}`,
    { headers: headers(config.secretKey, config.secretKey) },
  );
  await response.body?.cancel();
  if (response.ok) return true;
  if (response.status === 400 || response.status === 404) return false;
  fail('M2_STORAGE_LOOKUP_FAILED');
}

async function createTicket(config, owner, fixture) {
  const ticket = await expectOk(
    await rpc(config, owner, 'create_unbound_file_upload', {
      p_purpose: fixture.purpose,
      p_filename: fixture.filename,
      p_declared_mime_type: fixture.mimeType,
      p_size_bytes: fixture.bytes.byteLength,
    }),
    `ticket-${fixture.filename}`,
  );
  if (!ticket?.uploadId || ticket.bucket !== 'quarantine' || !ticket.path) {
    fail('M2_UPLOAD_TICKET_INVALID');
  }
  await uploadObject(config, owner, ticket.bucket, ticket.path, fixture.bytes, fixture.mimeType);
  return ticket;
}

async function createVideoTicket(config, owner, bytes) {
  const uploadId = randomUUID();
  const quarantinePath = `${owner.id}/${uploadId}/closed-beta.mp4`;
  await sql(`insert into public.file_uploads(
      id,user_id,purpose,original_filename,extension,declared_mime_type,size_bytes,max_size_bytes,
      quarantine_path,target_bucket,target_path
    ) values(
      '${uploadId}'::uuid,'${owner.id}'::uuid,'completion_proof','closed-beta.mp4','mp4',
      'video/mp4',${bytes.byteLength},20971520,'${quarantinePath}','completion-proofs',
      '${owner.id}/completion_proof/${uploadId}.mp4'
    )`);
  await uploadObject(config, owner, 'quarantine', quarantinePath, bytes, 'video/mp4');
  return { uploadId, bucket: 'quarantine', path: quarantinePath };
}

async function startScan(config, owner, uploadId, operationId = randomUUID()) {
  return await expectOk(
    await invoke(config, owner, 'scan-upload', {
      uploadId,
      action: 'start',
      operationId,
    }),
    'scan-start',
  );
}

async function scanStatus(config, owner, uploadId) {
  return await expectOk(
    await invoke(config, owner, 'scan-upload', { uploadId, action: 'status' }),
    'scan-status',
  );
}

async function attemptDetails(uploadId) {
  if (!/^[0-9a-f-]{36}$/u.test(uploadId)) fail('M2_UPLOAD_ID_INVALID');
  return await sqlJson(`select jsonb_build_object(
    'jobId',j.id,'jobState',j.state,'attemptCount',j.attempt_count,
    'attemptId',a.id,'attemptState',a.state,'terminalCategory',a.terminal_category,
    'deadline',a.processing_deadline,
    'inputMime',a.input_mime_type,'outputMime',a.output_mime_type,
    'sanitizerId',a.sanitizer_id,
    'quarantineBucket',(select bucket from private.media_scan_artifacts where job_id=j.id and kind='quarantine'),
    'quarantinePath',(select path from private.media_scan_artifacts where job_id=j.id and kind='quarantine'),
    'inputBucket',(select bucket from private.media_scan_artifacts where attempt_id=a.id and kind='scan_input'),
    'inputPath',(select path from private.media_scan_artifacts where attempt_id=a.id and kind='scan_input'),
    'outputBucket',(select bucket from private.media_scan_artifacts where attempt_id=a.id and kind='scan_output'),
    'outputPath',(select path from private.media_scan_artifacts where attempt_id=a.id and kind='scan_output'),
    'finalBucket',(select bucket from private.media_scan_artifacts where attempt_id=a.id and kind='final_candidate'),
    'finalPath',(select path from private.media_scan_artifacts where attempt_id=a.id and kind='final_candidate')
  )::text from private.media_scan_jobs j
  left join private.media_scan_attempts a on a.id=j.current_attempt_id
  where j.upload_id='${uploadId}'::uuid`);
}

async function finalizationEventCount(attemptId) {
  if (!/^[0-9a-f-]{36}$/u.test(attemptId)) fail('M2_ATTEMPT_ID_INVALID');
  return Number(
    await sql(`select count(*) from private.media_scan_events
      where attempt_id='${attemptId}'::uuid and action='finalize'`),
  );
}

async function forceRetryReady(uploadId) {
  await sql(`update private.media_scan_jobs set retry_at=clock_timestamp()-interval '1 second'
    where upload_id='${uploadId}'::uuid and state='retryable_failure'`);
}

async function expireAttempt(attemptId) {
  await sql(`update private.media_scan_attempts set
    claimed_at=statement_timestamp()-interval '121 seconds',
    processing_deadline=statement_timestamp()-interval '1 second',
    heartbeat_at=statement_timestamp()-interval '1 second'
    where id='${attemptId}'::uuid`);
}

async function waitForReadiness(clamd) {
  let lastError;
  for (let index = 0; index < 120; index += 1) {
    try {
      return await clamd.readiness();
    } catch (error) {
      lastError = error;
      await new Promise((resolveWait) => setTimeout(resolveWait, 250));
    }
  }
  throw lastError ?? new Error('M2_CLAMD_NOT_READY');
}

function scannerRuntime(scanner, options) {
  const clamd = new scanner.ClamdClient({
    host: '127.0.0.1',
    port: options.clamdPort,
    maxBytes: scanner.MAX_UPLOAD_BYTES,
    chunkBytes: 64 * 1024,
    connectTimeoutMs: 2_000,
    responseTimeoutMs: 120_000,
    signatureMaxAgeSeconds: 168 * 60 * 60,
  });
  const imageSanitizer = scanner.createIsolatedImageSanitizer();
  const remux = scanner.createFfmpegRemuxer({
    run: createContainerRemuxRunner(options.tempRoot),
  });
  const sanitizer = async (input) => {
    if (input.declaredMimeType !== 'audio/mp4' && input.declaredMimeType !== 'video/mp4') {
      return await imageSanitizer(input);
    }
    try {
      return await remux(input);
    } catch (error) {
      if (error instanceof scanner.FfmpegRemuxError || error instanceof scanner.MediaPolicyError) {
        throw new scanner.IsolatedSanitizerError('sanitizer_media_rejected');
      }
      throw error;
    }
  };
  return {
    clamd,
    pipeline: scanner.createScannerPipeline({ malwareScanner: clamd, sanitizer }),
  };
}

function createWorker(scanner, options) {
  const runtime = scannerRuntime(scanner, options);
  const workerId = options.workerId ?? `integration-${process.pid}`;
  const captured = { claims: [], outputs: [], readbacks: [] };
  let droppedComplete = false;
  const controlFetch = async (url, init) => {
    const response = await fetch(url, init);
    const action = new Headers(init?.headers).get('x-sallah-scanner-action');
    if (options.dropCompleteResponse && action === 'complete' && !droppedComplete) {
      droppedComplete = true;
      await response.arrayBuffer();
      throw new Error('simulated-complete-response-loss');
    }
    return response;
  };
  const base = scanner.createScannerControlClient({
    controlOrigin: options.config.apiUrl,
    controlSecret: options.secrets.control,
    workerId,
    allowHttp: true,
    fetchImpl: controlFetch,
  });
  const control = {
    async claim(input) {
      const result = await base.claim(input);
      if (result.status === 'claimed') captured.claims.push(result);
      return result;
    },
    async prepareOutput(input) {
      const result = await base.prepareOutput(input);
      captured.outputs.push(result);
      return result;
    },
    async authorizeReadback(input) {
      if (options.dropReadbackAuthorization) throw new Error('simulated-readback-response-loss');
      const result = await base.authorizeReadback(input);
      captured.readbacks.push(result);
      return result;
    },
    async complete(input) {
      if (!options.completeTwice) return await base.complete(input);
      const settled = await Promise.allSettled([base.complete(input), base.complete(input)]);
      const clean = settled.flatMap((item) =>
        item.status === 'fulfilled' && item.value.status === 'clean' ? [item.value] : [],
      );
      if (clean.length === 0) fail('M2_ONE_WINNER_COMPLETION_INVALID');
      captured.oneWinner = true;
      return clean[0];
    },
    reject: (input) => base.reject(input),
    fail: (input) => base.fail(input),
  };
  let uploadResponseLost = false;
  const upload =
    options.dropUploadResponse || options.dropReadbackAuthorization
      ? async (uploadOptions) => {
          await scanner.uploadCapability({
            ...uploadOptions,
            fetchImpl: async (url, init) => {
              const response = await fetch(url, init);
              if (!uploadResponseLost) {
                uploadResponseLost = true;
                await response.arrayBuffer();
                throw new Error('simulated-output-response-loss');
              }
              return response;
            },
          });
        }
      : undefined;
  const worker = scanner.createMediaScannerWorker({
    workerId,
    storageOrigin: options.config.apiUrl,
    allowHttp: true,
    signatureMaxAgeSeconds: 168 * 60 * 60,
    attestationSecret: options.secrets.attestation,
    tempRoot: options.tempRoot,
    control,
    pipeline: runtime.pipeline,
    readiness: (signal) => runtime.clamd.readiness(signal),
    ...(upload ? { upload } : {}),
  });
  return { worker, control: base, clamd: runtime.clamd, captured };
}

async function runWorkerFor(scanner, options, uploadId, expected, behavior = {}) {
  const runtime = createWorker(scanner, { ...options, ...behavior });
  const result = await runtime.worker.runOne();
  const details = await attemptDetails(uploadId);
  if (result.status !== expected) {
    fail(
      `M2_WORKER_RESULT_INVALID:${expected}:${result.status}:${details.jobState}:${details.attemptState}:${details.terminalCategory ?? '-'}`,
    );
  }
  return { ...runtime, result, details };
}

async function assertProtectedBroker(config, owner, outsider, uploadId) {
  const outsiderResponse = await invoke(config, outsider, 'media-access', {
    uploadId,
    expiresInSeconds: 60,
  });
  await outsiderResponse.arrayBuffer();
  if (outsiderResponse.ok) fail('M2_PROTECTED_BROKER_OUTSIDER_ALLOWED');
  const ownerResponse = await expectOk(
    await invoke(config, owner, 'media-access', { uploadId, expiresInSeconds: 60 }),
    'protected-broker-owner',
  );
  if (!ownerResponse?.signedUrl) fail('M2_PROTECTED_BROKER_RESULT_INVALID');
  const download = await fetch(ownerResponse.signedUrl, { redirect: 'manual' });
  if (!download.ok || (await download.arrayBuffer()).byteLength === 0) {
    fail('M2_PROTECTED_BROKER_DOWNLOAD_FAILED');
  }
}

async function invokeCleanup(config, secret) {
  return await expectOk(
    await fetch(`${config.apiUrl}/functions/v1/privacy-worker`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-worker-secret': secret },
      body: '{}',
    }),
    'privacy-worker-cleanup',
  );
}

async function hmacReplay(scanner, config, secret) {
  const workerId = `replay-${process.pid}`;
  const body = {
    operationId: randomUUID(),
    nonceOperationId: randomUUID(),
    workerId,
    signatureTimestamp: new Date(Date.now() - 1_000).toISOString(),
    signatureMaxAgeSeconds: 168 * 60 * 60,
  };
  const nonce = randomUUID();
  const at = new Date(Date.now() - 1_000);
  const statuses = [];
  const client = scanner.createScannerControlClient({
    controlOrigin: config.apiUrl,
    controlSecret: secret,
    workerId,
    allowHttp: true,
    now: () => at,
    uuid: () => nonce,
    fetchImpl: async (url, init) => {
      const response = await fetch(url, init);
      statuses.push(response.status);
      return response;
    },
  });
  await client.request('claim', '-', body);
  try {
    await client.request('claim', '-', body);
    fail('M2_HMAC_REPLAY_ACCEPTED');
  } catch (error) {
    if (error?.message === 'M2_HMAC_REPLAY_ACCEPTED') throw error;
  }
  if (statuses.length !== 2 || statuses[0] !== 200 || statuses[1] !== 409) {
    fail('M2_HMAC_REPLAY_STATUS_INVALID');
  }
}

async function maximumImage() {
  const requireFromScanner = createRequire(
    pathToFileURL(join(repositoryRoot, 'services', 'media-scanner', 'package.json')),
  );
  const { Transformer } = requireFromScanner('@napi-rs/image');
  const width = 2_200;
  const height = 2_200;
  const pixels = new Uint8Array(width * height * 4);
  let state = 0x9e37_79b9;
  for (let index = 0; index < pixels.byteLength; index += 1) {
    state ^= state << 13;
    state ^= state >>> 17;
    state ^= state << 5;
    pixels[index] = state & 0xff;
  }
  const encoded = Uint8Array.from(await Transformer.fromRgbaPixels(pixels, width, height).png());
  if (encoded.byteLength <= 18 * 1024 * 1024 || encoded.byteLength > 20 * 1024 * 1024) {
    fail('M2_MAXIMUM_IMAGE_INVALID');
  }
  return encoded;
}

export async function verifyAvFixture(directory, path, expectedStreams, label) {
  const result = await runWorkerImageCommand(
    directory,
    '/opt/sallah-media/bin/ffprobe',
    [
      '-v',
      'error',
      '-show_entries',
      'format=format_name,duration,size:stream=index,codec_type,codec_name',
      '-of',
      'json',
      path,
    ],
    {
      label: `verify-${label}`,
      maxStdoutBytes: 16 * 1024,
      maxStderrBytes: 8 * 1024,
      readOnlyMount: true,
      timeoutMs: 10_000,
    },
  );
  let probe;
  try {
    probe = JSON.parse(result.stdout);
  } catch {
    fail(`M2_FIXTURE_PROBE_INVALID:${label}`);
  }
  const streams = Array.isArray(probe?.streams) ? probe.streams : [];
  const actualStreams = streams.map((stream) => `${stream.codec_type}:${stream.codec_name}`).sort();
  if (JSON.stringify(actualStreams) !== JSON.stringify([...expectedStreams].sort())) {
    fail(`M2_FIXTURE_STREAMS_INVALID:${label}`);
  }
  const formatNames = String(probe?.format?.format_name ?? '').split(',');
  const duration = Number(probe?.format?.duration);
  const reportedSize = Number(probe?.format?.size);
  const file = await readFile(path);
  if (
    !formatNames.includes('mov') ||
    !formatNames.includes('mp4') ||
    !Number.isFinite(duration) ||
    duration < 0.5 ||
    duration > 2 ||
    !Number.isSafeInteger(reportedSize) ||
    reportedSize !== file.byteLength ||
    file.byteLength === 0 ||
    file.byteLength > 1024 * 1024
  ) {
    fail(`M2_FIXTURE_FORMAT_INVALID:${label}`);
  }
  return Uint8Array.from(file);
}

export async function generateAvFixtures(directory) {
  const identity = randomUUID();
  const m4a = join(directory, `${identity}-voice.m4a`);
  const audioMp4 = join(directory, `${identity}-audio.mp4`);
  const videoMp4 = join(directory, `${identity}-completion.mp4`);
  const commonInput = ['-v', 'error', '-nostdin', '-protocol_whitelist', 'file,pipe,fd'];
  try {
    await runWorkerImageCommand(
      directory,
      '/opt/sallah-media/bin/ffmpeg',
      [
        ...commonInput,
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=440:duration=1',
        '-c:a',
        'aac',
        '-b:a',
        '64k',
        '-threads',
        '1',
        '-metadata',
        'title=IntegrationPrivate',
        '-f',
        'ipod',
        '-y',
        m4a,
      ],
      {
        label: 'generate-integration-m4a',
        maxStdoutBytes: 8 * 1024,
        maxStderrBytes: 8 * 1024,
        timeoutMs: 15_000,
      },
    );
    await runWorkerImageCommand(
      directory,
      '/opt/sallah-media/bin/ffmpeg',
      [
        ...commonInput,
        '-f',
        'lavfi',
        '-i',
        'sine=frequency=550:duration=1',
        '-c:a',
        'aac',
        '-b:a',
        '64k',
        '-threads',
        '1',
        '-metadata',
        'title=IntegrationPrivate',
        '-f',
        'mp4',
        '-y',
        audioMp4,
      ],
      {
        label: 'generate-integration-audio-mp4',
        maxStdoutBytes: 8 * 1024,
        maxStderrBytes: 8 * 1024,
        timeoutMs: 15_000,
      },
    );
    await runWorkerImageCommand(
      directory,
      '/opt/sallah-media/bin/ffmpeg',
      [
        ...commonInput,
        '-f',
        'lavfi',
        '-i',
        'color=c=black:s=32x32:d=1',
        '-f',
        'lavfi',
        '-i',
        'anullsrc=r=48000:cl=stereo',
        '-shortest',
        '-c:v',
        'libx264',
        '-pix_fmt',
        'yuv420p',
        '-c:a',
        'aac',
        '-threads',
        '1',
        '-metadata',
        'title=IntegrationPrivate',
        '-f',
        'mp4',
        '-y',
        videoMp4,
      ],
      {
        label: 'generate-integration-video-mp4',
        maxStdoutBytes: 8 * 1024,
        maxStderrBytes: 8 * 1024,
        timeoutMs: 15_000,
      },
    );
    const [m4aBytes, audioMp4Bytes, videoMp4Bytes] = await Promise.all([
      verifyAvFixture(directory, m4a, ['audio:aac'], 'integration-m4a'),
      verifyAvFixture(directory, audioMp4, ['audio:aac'], 'integration-audio-mp4'),
      verifyAvFixture(directory, videoMp4, ['audio:aac', 'video:h264'], 'integration-video-mp4'),
    ]);
    return { m4a: m4aBytes, audioMp4: audioMp4Bytes, videoMp4: videoMp4Bytes };
  } finally {
    await Promise.all([
      rm(m4a, { force: true }),
      rm(audioMp4, { force: true }),
      rm(videoMp4, { force: true }),
    ]);
  }
}

async function proveAutonomousStorageCleanup(scanner, context, workerOptions) {
  const ticket = await createTicket(context.config, context.owner, {
    purpose: 'request_media',
    filename: 'autonomous-aging.png',
    mimeType: 'image/png',
    bytes: onePixelPng,
  });
  await startScan(context.config, context.owner, ticket.uploadId);
  const workerId = `aging-${process.pid}`;
  const control = createWorker(scanner, { ...workerOptions, workerId });
  const ready = await control.clamd.readiness();
  const claim = await control.control.claim({
    workerId,
    signatureTimestamp: ready.signatureTimestamp,
    signatureMaxAgeSeconds: 168 * 60 * 60,
  });
  if (claim.status !== 'claimed') fail('M2_AGING_CLAIM_FAILED');
  const details = await attemptDetails(ticket.uploadId);
  for (const [bucket, path] of [
    [details.outputBucket, details.outputPath],
    [details.finalBucket, details.finalPath],
  ]) {
    if (!bucket || !path) fail('M2_AGING_ARTIFACT_CONTRACT_INVALID');
    await uploadServiceObject(context.config, bucket, path, onePixelPng, 'image/png');
  }
  await sql(`update private.media_scan_attempts set state='expired',
      updated_at=clock_timestamp()-interval '25 hours'
    where id='${claim.attemptId}'::uuid;
    update private.media_scan_jobs set state='retryable_failure',current_attempt_id=null,
      retry_at=clock_timestamp()+interval '1 hour',updated_at=clock_timestamp()-interval '25 hours'
    where upload_id='${ticket.uploadId}'::uuid;
    update private.media_scan_artifacts set
      state=case kind
        when 'quarantine' then 'source'
        when 'scan_input' then 'pending'
        when 'scan_output' then 'attested'
        when 'final_candidate' then 'promotion_pending'
      end,
      created_at=clock_timestamp()-interval '25 hours',
      updated_at=clock_timestamp()-interval '25 hours'
    where job_id=(select id from private.media_scan_jobs where upload_id='${ticket.uploadId}'::uuid)`);

  await invokeCleanup(context.config, context.secrets.privacy);
  for (const [bucket, path] of [
    [details.quarantineBucket, details.quarantinePath],
    [details.inputBucket, details.inputPath],
    [details.outputBucket, details.outputPath],
    [details.finalBucket, details.finalPath],
  ]) {
    if (!bucket || !path || (await storageObjectExists(context.config, bucket, path))) {
      fail('M2_AUTONOMOUS_AGING_STORAGE_RETAINED');
    }
  }
  const state = await sql(`select count(*) from private.media_scan_artifacts a
    join private.media_scan_jobs j on j.id=a.job_id
    where j.upload_id='${ticket.uploadId}'::uuid and a.state='deleted'`);
  if (Number(state) !== 4) fail('M2_AUTONOMOUS_AGING_DB_INVALID');
}

async function proveV2Flow(scanner, context) {
  const { config, owner, outsider, secrets } = context;
  const evidence = new Set();
  const workerOptions = {
    config,
    secrets,
    clamdPort: context.clamdPort,
    tempRoot: context.tempRoot,
  };

  await proveAutonomousStorageCleanup(scanner, context, workerOptions);
  evidence.add('autonomous-24h-storage-cleanup');

  const activeTicket = await createTicket(config, owner, {
    purpose: 'request_media',
    filename: 'active.png',
    mimeType: 'image/png',
    bytes: onePixelPng,
  });
  const operationId = randomUUID();
  const queued = await startScan(config, owner, activeTicket.uploadId, operationId);
  const queuedAgain = await startScan(config, owner, activeTicket.uploadId, operationId);
  if (queued.status !== 'queued' || JSON.stringify(queuedAgain) !== JSON.stringify(queued)) {
    fail('M2_QUEUED_REPLAY_INVALID');
  }
  evidence.add('queued-replay');
  const activeWorkerId = `active-${process.pid}`;
  const activeControl = createWorker(scanner, { ...workerOptions, workerId: activeWorkerId });
  const ready = await activeControl.clamd.readiness();
  const activeClaim = await activeControl.control.claim({
    workerId: activeWorkerId,
    signatureTimestamp: ready.signatureTimestamp,
    signatureMaxAgeSeconds: 168 * 60 * 60,
  });
  if (activeClaim.status !== 'claimed') fail('M2_ACTIVE_CLAIM_FAILED');
  const active = await scanStatus(config, owner, activeTicket.uploadId);
  if (active.status !== 'scanning') fail('M2_ACTIVE_REPLAY_INVALID');
  evidence.add('active-replay');
  evidence.add('signed-input');
  const activeBeforeCleanup = await attemptDetails(activeTicket.uploadId);
  await invokeCleanup(config, secrets.privacy);
  if (
    !activeBeforeCleanup.inputPath ||
    !(await storageObjectExists(config, 'scan-input', activeBeforeCleanup.inputPath))
  ) {
    fail('M2_ACTIVE_ARTIFACT_CLEANED');
  }
  evidence.add('cleanup-versus-active');

  const cleanTicket = await createTicket(config, owner, {
    purpose: 'request_media',
    filename: 'clean.png',
    mimeType: 'image/png',
    bytes: onePixelPng,
  });
  await startScan(config, owner, cleanTicket.uploadId);
  const cleanRun = await runWorkerFor(scanner, workerOptions, cleanTicket.uploadId, 'clean', {
    completeTwice: true,
  });
  if (!cleanRun.captured.oneWinner) fail('M2_ONE_WINNER_NOT_OBSERVED');
  if ((await finalizationEventCount(cleanRun.details.attemptId)) !== 1) {
    fail('M2_ONE_WINNER_EVENT_COUNT_INVALID');
  }
  if (
    cleanRun.captured.outputs.length !== 1 ||
    cleanRun.captured.readbacks.length !== 1 ||
    cleanRun.details.attemptCount !== 1
  ) {
    fail('M2_CLEAN_FLOW_INVALID');
  }
  evidence.add('one-winner-completion');
  evidence.add('signed-output');
  evidence.add('signed-readback');
  const cleanStatus = await scanStatus(config, owner, cleanTicket.uploadId);
  const cleanAgain = await scanStatus(config, owner, cleanTicket.uploadId);
  if (
    cleanStatus.status !== 'clean' ||
    JSON.stringify(cleanAgain) !== JSON.stringify(cleanStatus)
  ) {
    fail('M2_CLEAN_REPLAY_INVALID');
  }
  evidence.add('clean-replay');
  await assertProtectedBroker(config, owner, outsider, cleanTicket.uploadId);
  evidence.add('protected-broker-authorization');

  const completionLossTicket = await createTicket(config, owner, {
    purpose: 'request_media',
    filename: 'complete-loss.png',
    mimeType: 'image/png',
    bytes: onePixelPng,
  });
  await startScan(config, owner, completionLossTicket.uploadId);
  await runWorkerFor(scanner, workerOptions, completionLossTicket.uploadId, 'clean', {
    dropCompleteResponse: true,
  });
  evidence.add('clean-response-loss');

  const outputLossTicket = await createTicket(config, owner, {
    purpose: 'request_media',
    filename: 'output-loss.png',
    mimeType: 'image/png',
    bytes: onePixelPng,
  });
  await startScan(config, owner, outputLossTicket.uploadId);
  await runWorkerFor(scanner, workerOptions, outputLossTicket.uploadId, 'clean', {
    dropUploadResponse: true,
  });
  evidence.add('output-response-loss');

  const retryTicket = await createTicket(config, owner, {
    purpose: 'request_media',
    filename: 'retry.png',
    mimeType: 'image/png',
    bytes: onePixelPng,
  });
  await startScan(config, owner, retryTicket.uploadId);
  const failedRun = await runWorkerFor(
    scanner,
    workerOptions,
    retryTicket.uploadId,
    'retryable_failure',
    { dropReadbackAuthorization: true },
  );
  const firstAttempt = failedRun.details;
  if (
    !firstAttempt.outputPath ||
    !(await storageObjectExists(config, 'scan-output', firstAttempt.outputPath))
  ) {
    fail('M2_OLD_OUTPUT_ORPHAN_MISSING');
  }
  await forceRetryReady(retryTicket.uploadId);
  const recoveredRun = await runWorkerFor(scanner, workerOptions, retryTicket.uploadId, 'clean');
  if (
    recoveredRun.details.attemptCount !== 2 ||
    recoveredRun.details.inputPath === firstAttempt.inputPath ||
    recoveredRun.details.outputPath === firstAttempt.outputPath ||
    recoveredRun.details.finalPath === firstAttempt.finalPath
  ) {
    fail('M2_RETRY_ARTIFACT_REUSED');
  }
  evidence.add('distinct-retry-artifacts');
  await invokeCleanup(config, secrets.privacy);
  if (await storageObjectExists(config, 'scan-output', firstAttempt.outputPath)) {
    fail('M2_OLD_OUTPUT_ORPHAN_RETAINED');
  }
  evidence.add('old-attempt-orphan');

  const av = await generateAvFixtures(context.tempRoot);
  const avFlows = [
    {
      evidence: 'real-m4a-clean',
      ticket: await createTicket(config, owner, {
        purpose: 'request_audio',
        filename: 'voice.m4a',
        mimeType: 'audio/mp4',
        bytes: av.m4a,
      }),
      sanitizerId: 'sallah.ffmpeg.remux.audio-mp4',
      mimeType: 'audio/mp4',
    },
    {
      evidence: 'real-mp4-audio-clean',
      ticket: await createTicket(config, owner, {
        purpose: 'request_audio',
        filename: 'voice.mp4',
        mimeType: 'audio/mp4',
        bytes: av.audioMp4,
      }),
      sanitizerId: 'sallah.ffmpeg.remux.audio-mp4',
      mimeType: 'audio/mp4',
    },
    {
      evidence: 'real-mp4-video-clean',
      ticket: await createVideoTicket(config, owner, av.videoMp4),
      sanitizerId: 'sallah.ffmpeg.remux.video-mp4',
      mimeType: 'video/mp4',
    },
  ];
  for (const flow of avFlows) {
    await startScan(config, owner, flow.ticket.uploadId);
    const run = await runWorkerFor(scanner, workerOptions, flow.ticket.uploadId, 'clean');
    const status = await scanStatus(config, owner, flow.ticket.uploadId);
    if (
      status.status !== 'clean' ||
      status.mimeType !== flow.mimeType ||
      run.details.sanitizerId !== flow.sanitizerId ||
      run.details.inputMime !== flow.mimeType ||
      run.details.outputMime !== flow.mimeType
    ) {
      fail(`M2_AV_FLOW_INVALID:${flow.evidence}`);
    }
    evidence.add(flow.evidence);
  }

  const rejectionFixtures = [
    {
      evidence: 'real-eicar',
      ticket: await createTicket(config, owner, {
        purpose: 'request_media',
        filename: 'eicar.png',
        mimeType: 'image/png',
        bytes: eicar,
      }),
    },
    {
      evidence: 'pdf-fail-closed',
      ticket: await createTicket(config, owner, {
        purpose: 'provider_document',
        filename: 'blocked.pdf',
        mimeType: 'application/pdf',
        bytes: Buffer.from('%PDF-1.7\n%%EOF\n', 'ascii'),
      }),
    },
    {
      evidence: 'malformed-audio-video-fail-closed',
      ticket: await createTicket(config, owner, {
        purpose: 'request_audio',
        filename: 'blocked.m4a',
        mimeType: 'audio/mp4',
        bytes: Buffer.from('00000018667479704d344120000000004d344120', 'hex'),
      }),
    },
    {
      evidence: 'malformed-audio-video-fail-closed',
      ticket: await createVideoTicket(
        config,
        owner,
        Buffer.from('000000186674797069736f6d0000000069736f6d', 'hex'),
      ),
    },
    {
      evidence: 'polyglot-fail-closed',
      ticket: await createTicket(config, owner, {
        purpose: 'request_media',
        filename: 'polyglot.png',
        mimeType: 'image/png',
        bytes: Buffer.concat([onePixelPng, Buffer.from('PK\u0003\u0004trailer', 'binary')]),
      }),
    },
  ];
  for (const fixture of rejectionFixtures) {
    await startScan(config, owner, fixture.ticket.uploadId);
    await runWorkerFor(scanner, workerOptions, fixture.ticket.uploadId, 'rejected');
    const terminal = await scanStatus(config, owner, fixture.ticket.uploadId);
    const terminalAgain = await scanStatus(config, owner, fixture.ticket.uploadId);
    if (
      terminal.status !== 'rejected' ||
      JSON.stringify(terminalAgain) !== JSON.stringify(terminal)
    ) {
      fail('M2_TERMINAL_REPLAY_INVALID');
    }
    evidence.add(fixture.evidence);
  }
  evidence.add('terminal-replay');

  const maxBytes = await maximumImage();
  const maximumTicket = await createTicket(config, owner, {
    purpose: 'provider_document',
    filename: 'near-20mib.png',
    mimeType: 'image/png',
    bytes: maxBytes,
  });
  await startScan(config, owner, maximumTicket.uploadId);
  const maximumStarted = performance.now();
  await runWorkerFor(scanner, workerOptions, maximumTicket.uploadId, 'clean');
  const maximumDurationMs = Math.round(performance.now() - maximumStarted);
  if (maximumDurationMs >= 120_000) fail('M2_MAXIMUM_DEADLINE_EXCEEDED');
  evidence.add('near-20mib-static-image');

  evidence.add('fresh-signature');
  const staleWorkerId = `stale-signature-${process.pid}`;
  const staleControl = createWorker(scanner, { ...workerOptions, workerId: staleWorkerId });
  try {
    await staleControl.control.claim({
      workerId: staleWorkerId,
      signatureTimestamp: new Date(Date.now() - 169 * 60 * 60 * 1_000).toISOString(),
      signatureMaxAgeSeconds: 168 * 60 * 60,
    });
    fail('M2_STALE_SIGNATURE_ACCEPTED');
  } catch (error) {
    if (error?.message === 'M2_STALE_SIGNATURE_ACCEPTED') throw error;
  }
  evidence.add('stale-signature');

  await hmacReplay(scanner, config, secrets.control);
  evidence.add('scanner-hmac-replay');
  await expireAttempt(activeClaim.attemptId);
  try {
    await activeControl.control.fail({
      attemptId: activeClaim.attemptId,
      attemptToken: activeClaim.attemptToken,
      failureCategory: 'stale_worker_probe',
    });
    fail('M2_STALE_WORKER_ACCEPTED');
  } catch (error) {
    if (error?.message === 'M2_STALE_WORKER_ACCEPTED') throw error;
  }
  evidence.add('stale-worker');

  const clamdLogs = await runDocker(['logs', context.clamdName], {
    label: 'local-clamd-logs',
  });
  if (!/Sallah\.Test\.Eicar\.UNOFFICIAL FOUND/u.test(`${clamdLogs.stdout}${clamdLogs.stderr}`)) {
    fail('M2_REAL_EICAR_NOT_OBSERVED');
  }

  return { evidence, maximumBytes: maxBytes.byteLength, maximumDurationMs };
}

async function runIntegration() {
  await runTool('pnpm', ['--filter', '@sallah/media-scanner', 'build'], {
    label: 'media-scanner-build',
  });
  const scanner = await import(
    `${pathToFileURL(join(repositoryRoot, 'services', 'media-scanner', 'dist', 'index.js')).href}?m2v=${Date.now()}`
  );
  const tempRoot = await mkdtemp(join(tmpdir(), 'sallah-m2v-integration-'));
  const signatureDirectory = join(tempRoot, 'signatures');
  const workerTemp = join(tempRoot, 'worker');
  await Promise.all([
    mkdir(signatureDirectory, { mode: 0o755 }),
    mkdir(workerTemp, { mode: 0o700 }),
  ]);
  const secrets = {
    control: `control-${randomBytes(40).toString('hex')}`,
    attestation: `attestation-${randomBytes(40).toString('hex')}`,
    privacy: `privacy-${randomBytes(40).toString('hex')}`,
  };
  const clamdPort = await reserveLoopbackPort();
  let clamdName;
  let functionServer;
  let edgeOutput = '';
  let localDatabaseReset = false;
  let primaryError;
  let result;
  try {
    await resetLocalSupabase();
    localDatabaseReset = true;
    const residueBefore = await residueSnapshot();
    await buildDeterministicSignatureDatabase(signatureDirectory);
    clamdName = await startClamd(signatureDirectory, clamdPort);
    const readinessProbe = scannerRuntime(scanner, { clamdPort });
    try {
      await waitForReadiness(readinessProbe.clamd);
    } catch (error) {
      const logs = await runDocker(['logs', clamdName], {
        acceptCodes: [1],
        label: 'local-clamd-readiness-logs',
      });
      process.stderr.write(`${logs.stdout}${logs.stderr}`.slice(-8_000));
      throw error;
    }
    const config = localEnvironment();
    const envFile = await writeFunctionEnvironment(tempRoot, secrets, config);
    functionServer = await ensureFunctions(config, { envFile });
    functionServer.stdout?.on('data', (chunk) => {
      edgeOutput = `${edgeOutput}${String(chunk)}`.slice(-16_000);
    });
    functionServer.stderr?.on('data', (chunk) => {
      edgeOutput = `${edgeOutput}${String(chunk)}`.slice(-16_000);
    });
    const owner = await createUser(config, 'm2v-owner');
    const outsider = await createUser(config, 'm2v-outsider');
    result = await proveV2Flow(scanner, {
      config,
      owner,
      outsider,
      secrets,
      clamdPort,
      clamdName,
      tempRoot: workerTemp,
    });
    await stopFunctions(functionServer);
    functionServer = undefined;
    await resetLocalSupabase();
    localDatabaseReset = false;
    const residueAfter = await residueSnapshot();
    if (JSON.stringify(residueAfter) !== JSON.stringify(residueBefore)) {
      fail('M2_RESIDUE_COUNT_CHANGED');
    }
    result.evidence.add('residue-equality');
    for (const item of requiredEvidence) {
      if (!result.evidence.has(item)) fail(`M2_EVIDENCE_MISSING:${item}`);
    }
    process.stdout.write(
      `${JSON.stringify({
        status: 'pass',
        evidence: [...result.evidence].sort(),
        maximumBytes: result.maximumBytes,
        maximumDurationMs: result.maximumDurationMs,
        residueBefore,
        residueAfter,
        signatureMode: 'deterministic-local-unsigned-eicar-only',
      })}\n`,
    );
  } catch (error) {
    primaryError = error;
    if (edgeOutput) process.stderr.write(edgeOutput);
  } finally {
    if (functionServer) await stopFunctions(functionServer).catch(() => undefined);
    if (clamdName) await stopClamd(clamdName).catch(() => undefined);
    if (localDatabaseReset) await resetLocalSupabase().catch(() => undefined);
    await rm(tempRoot, { recursive: true, force: true }).catch(() => undefined);
  }
  if (primaryError) throw primaryError;
}

async function runSelfCheck() {
  if (new Set(requiredEvidence).size !== requiredEvidence.length) fail('M2_EVIDENCE_DUPLICATED');
  const source = await readFile(fileURLToPath(import.meta.url), 'utf8');
  const retiredPath = ['/v1', '/scan'].join('');
  if (source.includes(retiredPath) || source.includes('UPLOAD_SCANNER_' + 'URL')) {
    fail('M2_RETIRED_PUSH_CONTRACT_RETAINED');
  }
  process.stdout.write(
    `Media scanner V2 integration self-check PASS (${requiredEvidence.length} gates).\n`,
  );
}

const invokedPath = process.argv[1] ? pathToFileURL(resolve(process.argv[1])).href : '';
if (invokedPath === import.meta.url) {
  if (process.argv.includes('--self-check')) await runSelfCheck();
  else await runIntegration();
}

export { requiredEvidence, runIntegration as runMediaScannerSupabaseIntegration };
