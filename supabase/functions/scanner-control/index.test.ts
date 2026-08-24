import { assertEquals, assertStringIncludes } from 'jsr:@std/assert@1';
import {
  canonicalAttestation,
  canonicalControlRequest,
  hmacHex,
  type ScannerAttestation,
  scannerControlPath,
  type ScannerRuntimeConfig,
  sha256Hex,
} from '../_shared/scanner-control.ts';
import {
  createScannerControlHandler,
  type ScannerControlClient,
  type ScannerControlDependencies,
} from './index.ts';

const attemptId = '11111111-1111-4111-8111-111111111111';
const operationId = '22222222-2222-4222-8222-222222222222';
const nonceOperationId = '33333333-3333-4333-8333-333333333333';
const nonce = '44444444-4444-4444-8444-444444444444';
const inputPath = 'aa/bb/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
const outputPath = 'cc/dd/cccccccc-cccc-4ccc-8ccc-cccccccccccc';
const finalPath = 'clean/ee/ff/eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
const now = new Date('2026-08-21T12:01:00.000Z');
const config: ScannerRuntimeConfig = {
  appEnv: 'test',
  mode: 'external',
  controlSecret: 'control-secret-that-is-at-least-thirty-two-bytes',
  attestationSecret: 'attestation-secret-that-is-at-least-thirty-two-bytes',
  storageOrigin: 'http://127.0.0.1:54321',
  controlOrigin: 'http://127.0.0.1:54321',
  signatureMaxAgeSeconds: 3600,
};
const s3Credentials = {
  accessKeyId: 'scanner-edge-only-access-key',
  secretAccessKey: 'scanner-edge-only-secret-that-never-leaves-edge',
  region: 'local',
};

type RpcResult = { data: unknown; error: unknown | null };

class FakeClient implements ScannerControlClient {
  readonly calls: Array<{ kind: string; detail: unknown }> = [];
  readonly responses = new Map<string, RpcResult>();
  readonly responseQueues = new Map<string, RpcResult[]>();
  copyError: unknown | null = null;
  info = {
    size: 1024,
    contentType: 'image/png',
    metadata: { eTag: '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"' },
  };
  readonly infoByObject = new Map<
    string,
    typeof this.info & { metadata?: Record<string, unknown> }
  >();
  signedOrigin = config.storageOrigin;
  trustedServiceOrigin = config.storageOrigin;
  afterRpc?: (name: string) => void;

  rpc(name: string, args: Record<string, unknown>) {
    this.calls.push({ kind: 'rpc', detail: { name, args } });
    this.afterRpc?.(name);
    const queued = this.responseQueues.get(name)?.shift();
    if (queued) return Promise.resolve(queued);
    return Promise.resolve(this.responses.get(name) ?? { data: null, error: null });
  }

  storage = {
    from: (bucket: string) => ({
      copy: (
        from: string,
        to: string,
        options: { destinationBucket: string },
      ) => {
        this.calls.push({ kind: 'copy', detail: { bucket, from, to, options } });
        return Promise.resolve({
          data: this.copyError ? null : { path: to },
          error: this.copyError,
        });
      },
      info: (path: string) => {
        this.calls.push({ kind: 'info', detail: { bucket, path } });
        return Promise.resolve({
          data: this.infoByObject.get(`${bucket}:${path}`) ?? this.info,
          error: null,
        });
      },
      createSignedUrl: (path: string, expiresIn: number) => {
        this.calls.push({ kind: 'signed-read', detail: { bucket, path, expiresIn } });
        return Promise.resolve({
          data: {
            signedUrl: `${this.signedOrigin}/storage/v1/object/sign/${bucket}/${path}?token=read`,
          },
          error: null,
        });
      },
    }),
  };
}

function dependencies(
  fake: FakeClient,
  nowProvider: () => Date = () => now,
): ScannerControlDependencies {
  return {
    createServiceClient: () => fake,
    runtimeConfig: () => config,
    storageServiceOrigin: () => fake.trustedServiceOrigin,
    s3SigningCredentials: () => s3Credentials,
    now: nowProvider,
    log: () => undefined,
  };
}

async function signedRequest(
  action: string,
  body: Record<string, unknown>,
  headerAttempt = '-',
  requestNonce = nonce,
  requestUrl = `${config.controlOrigin}${scannerControlPath}`,
  requestMethod = 'POST',
  workerId = 'scanner-worker-1',
) {
  const text = JSON.stringify(body);
  const timestamp = Math.floor(now.getTime() / 1000);
  const bodySha256 = await sha256Hex(text);
  const canonical = canonicalControlRequest({
    method: 'POST',
    path: scannerControlPath,
    workerId,
    action: action as Parameters<typeof canonicalControlRequest>[0]['action'],
    attemptId: headerAttempt,
    timestamp,
    nonce: requestNonce,
    bodySha256,
  });
  return new Request(requestUrl, {
    method: requestMethod,
    headers: {
      'content-type': 'application/json',
      'x-sallah-scanner-action': action,
      'x-sallah-scanner-attempt': headerAttempt,
      'x-sallah-scanner-worker': workerId,
      'x-sallah-scanner-timestamp': String(timestamp),
      'x-sallah-scanner-nonce': requestNonce,
      'x-sallah-scanner-signature': await hmacHex(config.controlSecret, canonical),
    },
    body: text,
  });
}

Deno.test('scanner-control accepts the trusted Edge runtime route while authenticating the public canonical path', async () => {
  const fake = new FakeClient();
  fake.signedOrigin = 'http://kong:8000';
  fake.trustedServiceOrigin = 'http://kong:8000';
  fake.responses.set('consume_media_scanner_nonce', { data: { accepted: true }, error: null });
  fake.responses.set('claim_media_scan_job', { data: claimReceipt(), error: null });
  fake.responses.set('get_media_scan_attempt_status', {
    data: statusReceipt({ attemptState: 'processing' }),
    error: null,
  });

  const response = await createScannerControlHandler(dependencies(fake))(
    await signedRequest(
      'claim',
      {
        operationId,
        nonceOperationId,
        workerId: 'scanner-worker-1',
        signatureTimestamp: '2026-08-21T12:00:00.000Z',
        signatureMaxAgeSeconds: 3600,
      },
      '-',
      nonce,
      'http://127.0.0.1:8081/scanner-control',
    ),
  );

  assertEquals(response.status, 200);
  const result = await response.json();
  assertEquals(result.status, 'claimed');
  assertEquals(new URL(result.inputUrl).origin, config.storageOrigin);
});

Deno.test('scanner-control never rebases a capability from an untrusted service origin', async () => {
  const fake = new FakeClient();
  fake.signedOrigin = 'http://untrusted.internal:8000';
  fake.trustedServiceOrigin = 'http://kong:8000';
  fake.responses.set('consume_media_scanner_nonce', { data: { accepted: true }, error: null });
  fake.responses.set('claim_media_scan_job', { data: claimReceipt(), error: null });
  fake.responses.set('get_media_scan_attempt_status', {
    data: statusReceipt({ attemptState: 'processing' }),
    error: null,
  });

  const response = await createScannerControlHandler(dependencies(fake))(
    await signedRequest(
      'claim',
      {
        operationId,
        nonceOperationId,
        workerId: 'scanner-worker-1',
        signatureTimestamp: '2026-08-21T12:00:00.000Z',
        signatureMaxAgeSeconds: 3600,
      },
      '-',
      nonce,
      'http://127.0.0.1:8081/scanner-control',
    ),
  );

  assertEquals(response.status, 400);
  assertEquals(fake.calls.some((call) => call.kind === 'signed-read'), true);
});

Deno.test('scanner-control rejects near-match runtime targets and alternate methods before DB or Storage', async () => {
  const body = {
    operationId,
    nonceOperationId,
    workerId: 'scanner-worker-1',
    signatureTimestamp: '2026-08-21T12:00:00.000Z',
    signatureMaxAgeSeconds: 3600,
  };
  const requests = [
    await signedRequest(
      'claim',
      body,
      '-',
      nonce,
      'http://127.0.0.1:8081/scanner-control/extra',
    ),
    await signedRequest(
      'claim',
      body,
      '-',
      nonce,
      'http://127.0.0.1:8081/scanner-control?debug=1',
    ),
    await signedRequest(
      'claim',
      body,
      '-',
      nonce,
      'http://127.0.0.1:8081/scanner-contro',
    ),
    await signedRequest(
      'claim',
      body,
      '-',
      nonce,
      'http://evil.example/functions/v1/scanner-control',
    ),
    await signedRequest(
      'claim',
      body,
      '-',
      nonce,
      'https://evil.example/scanner-control',
    ),
    await signedRequest(
      'claim',
      body,
      '-',
      nonce,
      'http://scanner@127.0.0.1:8081/scanner-control',
    ),
    await signedRequest(
      'claim',
      body,
      '-',
      nonce,
      'http://127.0.0.1:8081/scanner-control',
      'PUT',
    ),
  ];

  for (const request of requests) {
    const fake = new FakeClient();
    const response = await createScannerControlHandler(dependencies(fake))(request);
    assertEquals(response.status, 401);
    assertEquals(fake.calls, []);
  }
});

function claimReceipt() {
  return {
    status: 'scanning',
    jobId: '55555555-5555-4555-8555-555555555555',
    attemptId,
    workerId: 'scanner-worker-1',
    attemptOrdinal: 1,
    claimedAt: '2026-08-21T12:00:00.000Z',
    processingDeadline: '2026-08-21T12:02:00.000Z',
    leaseExpiresAt: '2026-08-21T12:02:00.000Z',
    purpose: 'request_media',
    declaredMimeType: 'image/png',
    sizeBytes: 1024,
    maxSizeBytes: 20 * 1024 * 1024,
    sourceBucket: 'quarantine',
    sourcePath: 'owner/upload/private-name.png',
    inputBucket: 'scan-input',
    inputPath,
    outputBucket: 'scan-output',
    outputPath,
    finalBucket: 'request-media',
    finalPath,
  };
}

function statusReceipt(overrides: Record<string, unknown> = {}) {
  return {
    jobId: '55555555-5555-4555-8555-555555555555',
    attemptId,
    workerId: 'scanner-worker-1',
    jobState: 'scanning',
    attemptState: 'readback_authorized',
    current: true,
    claimedAt: '2026-08-21T12:00:00.000Z',
    processingDeadline: '2026-08-21T12:02:00.000Z',
    finalizationDeadline: null,
    purpose: 'request_media',
    declaredMimeType: 'image/png',
    detectedInputMime: 'image/png',
    detectedOutputMime: 'image/png',
    inputSize: 1024,
    outputSize: 1024,
    inputSha256: '1'.repeat(64),
    outputSha256: '2'.repeat(64),
    sanitizer: 'decode-reencode-png-v1',
    sanitizerVersion: '1.0.0',
    manifestFingerprint: null,
    inputBucket: 'scan-input',
    inputPath,
    inputArtifactState: 'copied',
    outputBucket: 'scan-output',
    outputPath,
    outputArtifactState: 'readback_authorized',
    finalBucket: 'request-media',
    finalPath,
    finalArtifactState: 'pending',
    ...overrides,
  };
}

function manifest(): ScannerAttestation {
  return {
    schemaVersion: 'sallah-media-attestation-v1',
    attemptId,
    inputRef: inputPath,
    outputRef: outputPath,
    purpose: 'request_media',
    detectedInputMime: 'image/png',
    detectedOutputMime: 'image/png',
    inputSize: 1024,
    outputSize: 1024,
    inputSha256: '1'.repeat(64),
    outputSha256: '2'.repeat(64),
    originalScan: 'clean',
    finalScan: 'clean',
    sanitized: true,
    sanitizer: 'decode-reencode-png-v1',
    sanitizerVersion: '1.0.0',
    clamavEngineVersion: '1.4.3',
    signatureVersion: '28000',
    signatureTimestamp: '2026-08-21T12:00:00.000Z',
    signatureAgeSeconds: 60,
    processingDurationMs: 60_000,
    jobDeadline: '2026-08-21T12:02:00.000Z',
    nonce: '66666666-6666-4666-8666-666666666666',
    correlationId: '77777777-7777-4777-8777-777777777777',
    readbackSha256: '2'.repeat(64),
    storageFingerprint: 'a'.repeat(32),
  };
}

Deno.test('scanner-control rejects bad HMAC before service client and nonce consumption', async () => {
  const fake = new FakeClient();
  const req = await signedRequest('claim', {
    operationId,
    nonceOperationId,
    workerId: 'scanner-worker-1',
    signatureTimestamp: '2026-08-21T12:00:00.000Z',
    signatureMaxAgeSeconds: 3600,
  });
  req.headers.set('x-sallah-scanner-signature', '0'.repeat(64));
  let clients = 0;
  const deps = dependencies(fake);
  deps.createServiceClient = () => {
    clients += 1;
    return fake;
  };
  const response = await createScannerControlHandler(deps)(req);
  assertEquals(response.status, 401);
  assertEquals(clients, 0);
  assertEquals(fake.calls, []);
});

Deno.test('scanner-control binds the signed scanner identity to claim and every attempt action', async () => {
  const claimFake = new FakeClient();
  claimFake.responses.set('consume_media_scanner_nonce', {
    data: { accepted: true },
    error: null,
  });
  const mismatchedClaim = await createScannerControlHandler(dependencies(claimFake))(
    await signedRequest('claim', {
      operationId,
      nonceOperationId,
      workerId: 'scanner-worker-2',
      signatureTimestamp: '2026-08-21T12:00:00.000Z',
      signatureMaxAgeSeconds: 3600,
    }),
  );
  assertEquals(mismatchedClaim.status, 401);
  assertEquals(
    claimFake.calls.some((call) =>
      call.kind === 'rpc' &&
      (call.detail as { name: string }).name === 'claim_media_scan_job'
    ),
    false,
  );

  const heartbeatFake = new FakeClient();
  heartbeatFake.responses.set('consume_media_scanner_nonce', {
    data: { accepted: true },
    error: null,
  });
  heartbeatFake.responses.set('get_media_scan_attempt_status', {
    data: statusReceipt({ workerId: 'scanner-worker-1', attemptState: 'processing' }),
    error: null,
  });
  const mismatchedHeartbeat = await createScannerControlHandler(dependencies(heartbeatFake))(
    await signedRequest(
      'heartbeat',
      {
        operationId,
        nonceOperationId,
        attemptId,
        attemptToken: '99999999-9999-4999-8999-999999999999',
      },
      attemptId,
      nonce,
      `${config.controlOrigin}${scannerControlPath}`,
      'POST',
      'scanner-worker-2',
    ),
  );
  assertEquals(mismatchedHeartbeat.status, 401);
  assertEquals(
    heartbeatFake.calls.some((call) =>
      call.kind === 'rpc' &&
      (call.detail as { name: string }).name === 'heartbeat_media_scan_attempt'
    ),
    false,
  );
});

Deno.test('a consumed nonce replay returns only a generic conflict and cannot reach a capability', async () => {
  const fake = new FakeClient();
  fake.responses.set('consume_media_scanner_nonce', {
    data: null,
    error: { message: 'SCANNER_NONCE_REPLAY' },
  });
  fake.responses.set('claim_media_scan_job', { data: claimReceipt(), error: null });

  const response = await createScannerControlHandler(dependencies(fake))(
    await signedRequest('claim', {
      operationId,
      nonceOperationId,
      workerId: 'scanner-worker-1',
      signatureTimestamp: '2026-08-21T12:00:00.000Z',
      signatureMaxAgeSeconds: 3600,
    }),
  );

  assertEquals(response.status, 409);
  assertEquals(await response.json(), { error: 'scanner_control_unavailable' });
  assertEquals(fake.calls.map((call) => call.kind), ['rpc']);
  assertEquals((fake.calls[0]?.detail as { name: string }).name, 'consume_media_scanner_nonce');
});

Deno.test('a response-loss retry uses fresh nonce identity but keeps its domain operation stable', async () => {
  const fake = new FakeClient();
  fake.responses.set('consume_media_scanner_nonce', { data: { accepted: true }, error: null });
  fake.responses.set('claim_media_scan_job', { data: claimReceipt(), error: null });
  fake.responses.set('get_media_scan_attempt_status', {
    data: statusReceipt({ attemptState: 'processing' }),
    error: null,
  });
  const retryNonce = '55555555-5555-4555-8555-555555555555';
  const retryNonceOperationId = '66666666-6666-4666-8666-666666666666';
  const handler = createScannerControlHandler(dependencies(fake));
  const initial = await handler(
    await signedRequest('claim', {
      operationId,
      nonceOperationId,
      workerId: 'scanner-worker-1',
      signatureTimestamp: '2026-08-21T12:00:00.000Z',
      signatureMaxAgeSeconds: 3600,
    }),
  );
  const retry = await handler(
    await signedRequest(
      'claim',
      {
        operationId,
        nonceOperationId: retryNonceOperationId,
        workerId: 'scanner-worker-1',
        signatureTimestamp: '2026-08-21T12:00:00.000Z',
        signatureMaxAgeSeconds: 3600,
      },
      '-',
      retryNonce,
    ),
  );

  assertEquals(initial.status, 200);
  assertEquals(retry.status, 200);
  assertEquals((await initial.json()).attemptToken, (await retry.json()).attemptToken);
  const nonceCalls = fake.calls
    .filter((call) =>
      call.kind === 'rpc' &&
      (call.detail as { name: string }).name === 'consume_media_scanner_nonce'
    )
    .map((call) => (call.detail as { args: Record<string, unknown> }).args);
  assertEquals(nonceCalls.map((call) => call.p_nonce), [nonce, retryNonce]);
  assertEquals(nonceCalls.map((call) => call.p_operation_id), [
    nonceOperationId,
    retryNonceOperationId,
  ]);
  const domainCalls = fake.calls
    .filter((call) =>
      call.kind === 'rpc' && (call.detail as { name: string }).name === 'claim_media_scan_job'
    )
    .map((call) => (call.detail as { args: Record<string, unknown> }).args.p_operation_id);
  assertEquals(domainCalls, [operationId, operationId]);
});

Deno.test('claim replay cannot issue input access after expiry or attempt replacement', async () => {
  for (const scenario of ['expired', 'replaced'] as const) {
    const fake = new FakeClient();
    fake.responses.set('consume_media_scanner_nonce', { data: { accepted: true }, error: null });
    fake.responses.set('claim_media_scan_job', {
      data: {
        ...claimReceipt(),
        processingDeadline: scenario === 'expired'
          ? '2026-08-21T12:00:59.000Z'
          : '2026-08-21T12:02:00.000Z',
        leaseExpiresAt: scenario === 'expired'
          ? '2026-08-21T12:00:59.000Z'
          : '2026-08-21T12:02:00.000Z',
      },
      error: null,
    });
    fake.responses.set('get_media_scan_attempt_status', {
      data: statusReceipt({
        attemptState: 'processing',
        current: scenario !== 'replaced',
      }),
      error: null,
    });

    const response = await createScannerControlHandler(dependencies(fake))(
      await signedRequest('claim', {
        operationId,
        nonceOperationId,
        workerId: 'scanner-worker-1',
        signatureTimestamp: '2026-08-21T12:00:00.000Z',
        signatureMaxAgeSeconds: 3600,
      }),
    );

    assertEquals(response.status, 409, scenario);
    assertEquals(await response.json(), { error: 'scanner_control_unavailable' });
    assertEquals(fake.calls.some((call) => call.kind !== 'rpc'), false, scenario);
  }
});

Deno.test('claim consumes nonce first, server-copies input, and strips every private coordinate', async () => {
  const fake = new FakeClient();
  fake.responses.set('consume_media_scanner_nonce', { data: { accepted: true }, error: null });
  fake.responses.set('claim_media_scan_job', { data: claimReceipt(), error: null });
  fake.responses.set('get_media_scan_attempt_status', {
    data: statusReceipt({ attemptState: 'processing' }),
    error: null,
  });
  const response = await createScannerControlHandler(dependencies(fake))(
    await signedRequest('claim', {
      operationId,
      nonceOperationId,
      workerId: 'scanner-worker-1',
      signatureTimestamp: '2026-08-21T12:00:00.000Z',
      signatureMaxAgeSeconds: 3600,
    }),
  );
  assertEquals(response.status, 200);
  const payload = await response.json();
  assertEquals(payload.status, 'claimed');
  assertEquals(payload.attemptId, attemptId);
  assertEquals(typeof payload.attemptToken, 'string');
  assertEquals(payload.inputRef, inputPath);
  for (
    const key of [
      'jobId',
      'uploadId',
      'sourceBucket',
      'sourcePath',
      'inputBucket',
      'inputPath',
      'outputBucket',
      'outputPath',
      'finalBucket',
      'finalPath',
      'userId',
    ]
  ) assertEquals(key in payload, false, key);
  assertEquals((fake.calls[0]?.detail as { name: string }).name, 'consume_media_scanner_nonce');
  assertEquals(fake.calls.some((call) => call.kind === 'copy'), true);
  assertEquals(fake.calls.some((call) => call.kind === 'signed-read'), true);
  assertEquals(
    (fake.calls.find((call) => call.kind === 'signed-read')?.detail as { expiresIn: number })
      .expiresIn,
    45,
  );
});

Deno.test('claim fails closed for stale or caller-expanded ClamAV signature evidence', async () => {
  for (
    const claim of [
      {
        signatureTimestamp: '2026-08-21T10:59:59.000Z',
        signatureMaxAgeSeconds: 3600,
      },
      {
        signatureTimestamp: '2026-08-21T12:00:00.000Z',
        signatureMaxAgeSeconds: 7200,
      },
    ]
  ) {
    const fake = new FakeClient();
    fake.responses.set('consume_media_scanner_nonce', { data: { accepted: true }, error: null });
    fake.responses.set('claim_media_scan_job', { data: claimReceipt(), error: null });
    const response = await createScannerControlHandler(dependencies(fake))(
      await signedRequest('claim', {
        operationId,
        nonceOperationId,
        workerId: 'scanner-worker-1',
        ...claim,
      }),
    );
    assertEquals(response.status >= 400, true);
    assertEquals(
      fake.calls.some((call) =>
        call.kind === 'rpc' &&
        (call.detail as { name: string }).name === 'claim_media_scan_job'
      ),
      false,
    );
  }
});

Deno.test('prepare_output issues one exact no-upsert output capability only after RPC preparation', async () => {
  const fake = new FakeClient();
  fake.responses.set('consume_media_scanner_nonce', { data: { accepted: true }, error: null });
  fake.responses.set('prepare_media_scan_output', {
    data: {
      attemptId,
      status: 'output_prepared',
      outputBucket: 'scan-output',
      outputPath,
      processingDeadline: '2026-08-21T12:02:00.000Z',
      upsert: false,
      purpose: 'request_media',
      detectedInputMime: 'image/png',
      detectedOutputMime: 'image/png',
      jobDeadline: '2026-08-21T12:02:00.000Z',
    },
    error: null,
  });
  fake.responses.set('get_media_scan_attempt_status', {
    data: statusReceipt({ attemptState: 'output_prepared' }),
    error: null,
  });
  const body = {
    operationId,
    nonceOperationId,
    attemptId,
    attemptToken: '88888888-8888-4888-8888-888888888888',
    prepareFingerprint: '3'.repeat(64),
    inputMime: 'image/png',
    outputMime: 'image/png',
    inputSize: 1024,
    outputSize: 1024,
    inputSha256: '1'.repeat(64),
    outputSha256: '2'.repeat(64),
    sanitizer: 'decode-reencode-png-v1',
    sanitizerVersion: '1.0.0',
  };
  const response = await createScannerControlHandler(dependencies(fake))(
    await signedRequest('prepare_output', body, attemptId),
  );
  assertEquals(response.status, 200);
  const payload = await response.json();
  assertEquals(payload.outputRef, outputPath);
  assertEquals(payload.upsert, false);
  assertEquals('finalPath' in payload, false);
  const uploadUrl = new URL(payload.uploadUrl);
  assertEquals(
    uploadUrl.pathname,
    `/storage/v1/s3/scan-output/${outputPath}`,
  );
  assertEquals(uploadUrl.searchParams.get('X-Amz-Expires'), '45');
  assertEquals(
    uploadUrl.searchParams.get('X-Amz-SignedHeaders'),
    'content-type;host',
  );
  const kinds = fake.calls.map((call) => call.kind);
  assertEquals(kinds.includes('signed-upload'), false);
});

Deno.test('prepare replay cannot issue output access after expiry or attempt replacement', async () => {
  for (const scenario of ['expired', 'replaced'] as const) {
    const fake = new FakeClient();
    fake.responses.set('consume_media_scanner_nonce', { data: { accepted: true }, error: null });
    fake.responses.set('prepare_media_scan_output', {
      data: {
        attemptId,
        status: 'output_prepared',
        outputBucket: 'scan-output',
        outputPath,
        processingDeadline: scenario === 'expired'
          ? '2026-08-21T12:00:59.000Z'
          : '2026-08-21T12:02:00.000Z',
        upsert: false,
        purpose: 'request_media',
        detectedInputMime: 'image/png',
        detectedOutputMime: 'image/png',
        jobDeadline: scenario === 'expired'
          ? '2026-08-21T12:00:59.000Z'
          : '2026-08-21T12:02:00.000Z',
      },
      error: null,
    });
    fake.responses.set('get_media_scan_attempt_status', {
      data: statusReceipt({
        attemptState: 'output_prepared',
        current: scenario !== 'replaced',
      }),
      error: null,
    });
    const response = await createScannerControlHandler(dependencies(fake))(
      await signedRequest('prepare_output', {
        operationId,
        nonceOperationId,
        attemptId,
        attemptToken: '88888888-8888-4888-8888-888888888888',
        prepareFingerprint: '3'.repeat(64),
        inputMime: 'image/png',
        outputMime: 'image/png',
        inputSize: 1024,
        outputSize: 1024,
        inputSha256: '1'.repeat(64),
        outputSha256: '2'.repeat(64),
        sanitizer: 'decode-reencode-png-v1',
        sanitizerVersion: '1.0.0',
      }, attemptId),
    );

    assertEquals(response.status, 409, scenario);
    assertEquals(await response.json(), { error: 'scanner_control_unavailable' });
    assertEquals(fake.calls.some((call) => call.kind !== 'rpc'), false, scenario);
  }
});

Deno.test('authorize_readback verifies exact staged metadata before DB authorization and signed read', async () => {
  const fake = new FakeClient();
  fake.responses.set('consume_media_scanner_nonce', { data: { accepted: true }, error: null });
  fake.responses.set('get_media_scan_attempt_status', { data: statusReceipt(), error: null });
  fake.responses.set('authorize_media_scan_readback', {
    data: {
      attemptId,
      status: 'readback_authorized',
      outputBucket: 'scan-output',
      outputPath,
      sizeBytes: 1024,
      sha256: '2'.repeat(64),
    },
    error: null,
  });
  const response = await createScannerControlHandler(dependencies(fake))(
    await signedRequest('authorize_readback', {
      operationId,
      nonceOperationId,
      attemptId,
      attemptToken: '88888888-8888-4888-8888-888888888888',
      outputSize: 1024,
      outputSha256: '2'.repeat(64),
    }, attemptId),
  );
  assertEquals(response.status, 200);
  const payload = await response.json();
  assertEquals(payload.outputRef, outputPath);
  assertEquals(typeof payload.readUrl, 'string');
  const kinds = fake.calls.map((call) => call.kind);
  assertEquals(kinds.indexOf('info') < kinds.lastIndexOf('rpc'), true);
  assertEquals(kinds.indexOf('signed-read') > kinds.lastIndexOf('rpc'), true);
  assertEquals(
    (fake.calls.find((call) => call.kind === 'signed-read')?.detail as { expiresIn: number })
      .expiresIn,
    45,
  );
});

Deno.test('no capability is issued inside the finalization margin', async () => {
  const fake = new FakeClient();
  const deadline = '2026-08-21T12:01:15.000Z';
  fake.responses.set('consume_media_scanner_nonce', { data: { accepted: true }, error: null });
  fake.responses.set('prepare_media_scan_output', {
    data: {
      attemptId,
      status: 'output_prepared',
      outputBucket: 'scan-output',
      outputPath,
      processingDeadline: deadline,
      upsert: false,
      purpose: 'request_media',
      detectedInputMime: 'image/png',
      detectedOutputMime: 'image/png',
      jobDeadline: deadline,
    },
    error: null,
  });
  fake.responses.set('get_media_scan_attempt_status', {
    data: statusReceipt({ attemptState: 'output_prepared', processingDeadline: deadline }),
    error: null,
  });
  const response = await createScannerControlHandler(dependencies(fake))(
    await signedRequest('prepare_output', {
      operationId,
      nonceOperationId,
      attemptId,
      attemptToken: '88888888-8888-4888-8888-888888888888',
      prepareFingerprint: '3'.repeat(64),
      inputMime: 'image/png',
      outputMime: 'image/png',
      inputSize: 1024,
      outputSize: 1024,
      inputSha256: '1'.repeat(64),
      outputSha256: '2'.repeat(64),
      sanitizer: 'decode-reencode-png-v1',
      sanitizerVersion: '1.0.0',
    }, attemptId),
  );
  assertEquals(response.status, 409);
  assertEquals(fake.calls.some((call) => call.kind.startsWith('signed-')), false);
});

Deno.test('readback replay cannot issue access after expiry or replacement', async () => {
  for (const scenario of ['expired', 'replaced'] as const) {
    const fake = new FakeClient();
    fake.responses.set('consume_media_scanner_nonce', { data: { accepted: true }, error: null });
    fake.responseQueues.set('get_media_scan_attempt_status', [
      {
        data: statusReceipt({
          attemptState: 'readback_authorized',
          processingDeadline: scenario === 'expired'
            ? '2026-08-21T12:00:59.000Z'
            : '2026-08-21T12:02:00.000Z',
        }),
        error: null,
      },
      {
        data: statusReceipt({
          attemptState: 'readback_authorized',
          current: scenario !== 'replaced',
        }),
        error: null,
      },
    ]);
    fake.responses.set('authorize_media_scan_readback', {
      data: {
        attemptId,
        status: 'readback_authorized',
        outputBucket: 'scan-output',
        outputPath,
        sizeBytes: 1024,
        sha256: '2'.repeat(64),
      },
      error: null,
    });
    const response = await createScannerControlHandler(dependencies(fake))(
      await signedRequest('authorize_readback', {
        operationId,
        nonceOperationId,
        attemptId,
        attemptToken: '88888888-8888-4888-8888-888888888888',
        outputSize: 1024,
        outputSha256: '2'.repeat(64),
      }, attemptId),
    );

    assertEquals(response.status, 409, scenario);
    assertEquals(await response.json(), { error: 'scanner_control_unavailable' });
    assertEquals(fake.calls.some((call) => call.kind === 'signed-read'), false, scenario);
    if (scenario === 'expired') {
      assertEquals(fake.calls.some((call) => call.kind !== 'rpc'), false);
    }
  }
});

Deno.test('capability paths recheck the clock after awaited domain and Storage work', async () => {
  const expired = new Date('2026-08-21T12:02:01.000Z');

  {
    const fake = new FakeClient();
    fake.responses.set('consume_media_scanner_nonce', { data: { accepted: true }, error: null });
    fake.responses.set('claim_media_scan_job', { data: claimReceipt(), error: null });
    fake.responses.set('get_media_scan_attempt_status', {
      data: statusReceipt({ attemptState: 'processing' }),
      error: null,
    });
    const times = [now, now, expired];
    const response = await createScannerControlHandler(
      dependencies(fake, () => times.shift() ?? expired),
    )(
      await signedRequest('claim', {
        operationId,
        nonceOperationId,
        workerId: 'scanner-worker-1',
        signatureTimestamp: '2026-08-21T12:00:00.000Z',
        signatureMaxAgeSeconds: 3600,
      }),
    );
    assertEquals(response.status, 409);
    assertEquals(fake.calls.some((call) => call.kind === 'copy'), true);
    assertEquals(fake.calls.some((call) => call.kind === 'signed-read'), false);
  }

  {
    const fake = new FakeClient();
    fake.responses.set('consume_media_scanner_nonce', { data: { accepted: true }, error: null });
    fake.responses.set('prepare_media_scan_output', {
      data: {
        attemptId,
        status: 'output_prepared',
        outputBucket: 'scan-output',
        outputPath,
        processingDeadline: '2026-08-21T12:02:00.000Z',
        upsert: false,
        purpose: 'request_media',
        detectedInputMime: 'image/png',
        detectedOutputMime: 'image/png',
        jobDeadline: '2026-08-21T12:02:00.000Z',
      },
      error: null,
    });
    fake.responses.set('get_media_scan_attempt_status', {
      data: statusReceipt({ attemptState: 'output_prepared' }),
      error: null,
    });
    const times = [now, expired];
    const response = await createScannerControlHandler(
      dependencies(fake, () => times.shift() ?? expired),
    )(
      await signedRequest('prepare_output', {
        operationId,
        nonceOperationId,
        attemptId,
        attemptToken: '88888888-8888-4888-8888-888888888888',
        prepareFingerprint: '3'.repeat(64),
        inputMime: 'image/png',
        outputMime: 'image/png',
        inputSize: 1024,
        outputSize: 1024,
        inputSha256: '1'.repeat(64),
        outputSha256: '2'.repeat(64),
        sanitizer: 'decode-reencode-png-v1',
        sanitizerVersion: '1.0.0',
      }, attemptId),
    );
    assertEquals(response.status, 409);
    assertEquals(fake.calls.some((call) => call.kind === 'signed-upload'), false);
  }

  {
    const fake = new FakeClient();
    fake.responses.set('consume_media_scanner_nonce', { data: { accepted: true }, error: null });
    fake.responses.set('get_media_scan_attempt_status', {
      data: statusReceipt({ attemptState: 'readback_authorized' }),
      error: null,
    });
    fake.responses.set('authorize_media_scan_readback', {
      data: {
        attemptId,
        status: 'readback_authorized',
        outputBucket: 'scan-output',
        outputPath,
        sizeBytes: 1024,
        sha256: '2'.repeat(64),
      },
      error: null,
    });
    const times = [now, now, expired];
    const response = await createScannerControlHandler(
      dependencies(fake, () => times.shift() ?? expired),
    )(
      await signedRequest('authorize_readback', {
        operationId,
        nonceOperationId,
        attemptId,
        attemptToken: '88888888-8888-4888-8888-888888888888',
        outputSize: 1024,
        outputSha256: '2'.repeat(64),
      }, attemptId),
    );
    assertEquals(response.status, 409);
    assertEquals(fake.calls.some((call) => call.kind === 'signed-read'), false);
  }
});

Deno.test('complete verifies attestation and metadata, copies server-side, and returns no private receipt', async () => {
  const fake = new FakeClient();
  fake.responses.set('consume_media_scanner_nonce', { data: { accepted: true }, error: null });
  fake.responses.set('get_media_scan_attempt_status', { data: statusReceipt(), error: null });
  fake.responses.set('record_media_scan_attestation', {
    data: {
      attemptId,
      status: 'attested',
      manifestFingerprint: '4'.repeat(64),
      finalizationDeadline: '2026-08-21T12:02:15.000Z',
    },
    error: null,
  });
  fake.responses.set('finalize_media_scan_job', {
    data: {
      uploadId: '99999999-9999-4999-8999-999999999999',
      status: 'clean',
      sanitized: true,
      storageBucket: 'request-media',
      storagePath: finalPath,
      mimeType: 'image/png',
      sizeBytes: 1024,
    },
    error: null,
  });
  const attestation = manifest();
  const canonical = canonicalAttestation(attestation);
  const fingerprint = await sha256Hex(canonical);
  const response = await createScannerControlHandler(dependencies(fake))(
    await signedRequest('complete', {
      operationId,
      finalizeOperationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      nonceOperationId,
      attemptId,
      attemptToken: '88888888-8888-4888-8888-888888888888',
      manifestFingerprint: fingerprint,
      manifest: attestation,
      attestationSignature: await hmacHex(config.attestationSecret, canonical),
    }, attemptId),
  );
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    status: 'clean',
    attemptId,
    sanitized: true,
    mimeType: 'image/png',
    sizeBytes: 1024,
  });
  assertEquals(fake.calls.some((call) => call.kind === 'copy'), true);
  const serialized = JSON.stringify(fake.calls);
  assertStringIncludes(serialized, 'record_media_scan_attestation');
  assertStringIncludes(serialized, 'finalize_media_scan_job');
  const mutationOperationIds = fake.calls
    .filter((call) => call.kind === 'rpc')
    .map((call) => call.detail as { name: string; args: Record<string, unknown> })
    .filter((call) =>
      ['record_media_scan_attestation', 'finalize_media_scan_job'].includes(call.name)
    )
    .map((call) => call.args.p_operation_id);
  assertEquals(new Set(mutationOperationIds).size, 2);
});

Deno.test('complete reconciles a same-attempt promotion after copy response loss', async () => {
  const fake = new FakeClient();
  fake.copyError = { message: 'response lost' };
  const attestation = manifest();
  const canonical = canonicalAttestation(attestation);
  const fingerprint = await sha256Hex(canonical);
  fake.responses.set('consume_media_scanner_nonce', { data: { accepted: true }, error: null });
  fake.responses.set('get_media_scan_attempt_status', {
    data: statusReceipt({
      attemptState: 'attested',
      finalizationDeadline: '2026-08-21T12:02:15.000Z',
      manifestFingerprint: fingerprint,
      outputArtifactState: 'attested',
      finalArtifactState: 'promotion_pending',
    }),
    error: null,
  });
  fake.responses.set('record_media_scan_attestation', {
    data: { attemptId, status: 'attested' },
    error: null,
  });
  fake.responses.set('finalize_media_scan_job', {
    data: { status: 'clean', sanitized: true, mimeType: 'image/png', sizeBytes: 1024 },
    error: null,
  });
  const response = await createScannerControlHandler(dependencies(fake))(
    await signedRequest('complete', {
      operationId,
      finalizeOperationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      nonceOperationId,
      attemptId,
      attemptToken: '88888888-8888-4888-8888-888888888888',
      manifestFingerprint: fingerprint,
      manifest: attestation,
      attestationSignature: await hmacHex(config.attestationSecret, canonical),
    }, attemptId),
  );
  assertEquals(response.status, 200);
  assertEquals(fake.calls.filter((call) => call.kind === 'info').length >= 2, true);
});

Deno.test('copy response loss rejects a same-size same-MIME destination with a different object fingerprint', async () => {
  const fake = new FakeClient();
  fake.copyError = { message: 'duplicate destination after ambiguous copy response' };
  fake.infoByObject.set(`scan-output:${outputPath}`, {
    size: 1024,
    contentType: 'image/png',
    metadata: { eTag: '"aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"' },
  });
  fake.infoByObject.set(`request-media:${finalPath}`, {
    size: 1024,
    contentType: 'image/png',
    metadata: { eTag: '"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"' },
  });
  const attestation = manifest();
  const canonical = canonicalAttestation(attestation);
  const fingerprint = await sha256Hex(canonical);
  fake.responses.set('consume_media_scanner_nonce', { data: { accepted: true }, error: null });
  fake.responses.set('get_media_scan_attempt_status', {
    data: statusReceipt({
      attemptState: 'attested',
      finalizationDeadline: '2026-08-21T12:02:15.000Z',
      manifestFingerprint: fingerprint,
      outputArtifactState: 'attested',
      finalArtifactState: 'promotion_pending',
    }),
    error: null,
  });
  fake.responses.set('record_media_scan_attestation', {
    data: { attemptId, status: 'attested' },
    error: null,
  });
  fake.responses.set('finalize_media_scan_job', {
    data: { status: 'clean', sanitized: true, mimeType: 'image/png', sizeBytes: 1024 },
    error: null,
  });

  const response = await createScannerControlHandler(dependencies(fake))(
    await signedRequest('complete', {
      operationId,
      finalizeOperationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      nonceOperationId,
      attemptId,
      attemptToken: '88888888-8888-4888-8888-888888888888',
      manifestFingerprint: fingerprint,
      manifest: attestation,
      attestationSignature: await hmacHex(config.attestationSecret, canonical),
    }, attemptId),
  );

  assertEquals(response.status >= 400, true);
  assertEquals(
    fake.calls.some((call) =>
      call.kind === 'rpc' &&
      (call.detail as { name: string }).name === 'finalize_media_scan_job'
    ),
    false,
  );
});

Deno.test('completion rejects a staging object swapped after the signed readback attestation', async () => {
  const fake = new FakeClient();
  fake.infoByObject.set(`scan-output:${outputPath}`, {
    size: 1024,
    contentType: 'image/png',
    metadata: { eTag: '"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"' },
  });
  fake.responses.set('consume_media_scanner_nonce', { data: { accepted: true }, error: null });
  fake.responses.set('get_media_scan_attempt_status', { data: statusReceipt(), error: null });
  const attestation = manifest();
  const canonical = canonicalAttestation(attestation);
  const fingerprint = await sha256Hex(canonical);
  const response = await createScannerControlHandler(dependencies(fake))(
    await signedRequest('complete', {
      operationId,
      finalizeOperationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      nonceOperationId,
      attemptId,
      attemptToken: '88888888-8888-4888-8888-888888888888',
      manifestFingerprint: fingerprint,
      manifest: attestation,
      attestationSignature: await hmacHex(config.attestationSecret, canonical),
    }, attemptId),
  );
  assertEquals(response.status, 409);
  assertEquals(fake.calls.some((call) => call.kind === 'copy'), false);
  assertEquals(
    fake.calls.some((call) =>
      call.kind === 'rpc' &&
      (call.detail as { name: string }).name === 'record_media_scan_attestation'
    ),
    false,
  );
});

Deno.test('promotion rechecks the attested staging fingerprint immediately before copy', async () => {
  const fake = new FakeClient();
  fake.responses.set('consume_media_scanner_nonce', { data: { accepted: true }, error: null });
  fake.responses.set('get_media_scan_attempt_status', { data: statusReceipt(), error: null });
  fake.responses.set('record_media_scan_attestation', {
    data: { attemptId, status: 'attested' },
    error: null,
  });
  fake.responses.set('finalize_media_scan_job', {
    data: { status: 'clean', sanitized: true, mimeType: 'image/png', sizeBytes: 1024 },
    error: null,
  });
  fake.afterRpc = (name) => {
    if (name !== 'record_media_scan_attestation') return;
    const swapped = {
      size: 1024,
      contentType: 'image/png',
      metadata: { eTag: '"bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"' },
    };
    fake.infoByObject.set(`scan-output:${outputPath}`, swapped);
    fake.infoByObject.set(`request-media:${finalPath}`, swapped);
  };
  const attestation = manifest();
  const canonical = canonicalAttestation(attestation);
  const fingerprint = await sha256Hex(canonical);
  const response = await createScannerControlHandler(dependencies(fake))(
    await signedRequest('complete', {
      operationId,
      finalizeOperationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      nonceOperationId,
      attemptId,
      attemptToken: '88888888-8888-4888-8888-888888888888',
      manifestFingerprint: fingerprint,
      manifest: attestation,
      attestationSignature: await hmacHex(config.attestationSecret, canonical),
    }, attemptId),
  );
  assertEquals(response.status, 409);
  assertEquals(fake.calls.some((call) => call.kind === 'copy'), false);
  assertEquals(
    fake.calls.some((call) =>
      call.kind === 'rpc' && (call.detail as { name: string }).name === 'finalize_media_scan_job'
    ),
    false,
  );
});

Deno.test('completed replay reconstructs only the safe clean projection without promotion', async () => {
  const fake = new FakeClient();
  const attestation = manifest();
  const canonical = canonicalAttestation(attestation);
  const fingerprint = await sha256Hex(canonical);
  fake.responses.set('consume_media_scanner_nonce', { data: { accepted: true }, error: null });
  fake.responses.set('get_media_scan_attempt_status', {
    data: statusReceipt({
      jobState: 'clean',
      attemptState: 'completed',
      manifestFingerprint: fingerprint,
      outputArtifactState: 'deleted',
      finalArtifactState: 'retained',
    }),
    error: null,
  });
  fake.responses.set('finalize_media_scan_job', {
    data: {
      uploadId: '99999999-9999-4999-8999-999999999999',
      status: 'clean',
      sanitized: true,
      storageBucket: 'request-media',
      storagePath: finalPath,
      contentHash: '2'.repeat(64),
      mimeType: 'image/png',
      sizeBytes: 1024,
    },
    error: null,
  });
  const response = await createScannerControlHandler(dependencies(fake))(
    await signedRequest('complete', {
      operationId,
      finalizeOperationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      nonceOperationId,
      attemptId,
      attemptToken: '88888888-8888-4888-8888-888888888888',
      manifestFingerprint: fingerprint,
      manifest: attestation,
      attestationSignature: await hmacHex(config.attestationSecret, canonical),
    }, attemptId),
  );
  assertEquals(response.status, 200);
  assertEquals(await response.json(), {
    status: 'clean',
    attemptId,
    sanitized: true,
    mimeType: 'image/png',
    sizeBytes: 1024,
  });
  assertEquals(fake.calls.some((call) => call.kind === 'copy'), false);
});

Deno.test('an expired attempt cannot attest, promote, or finalize', async () => {
  const fake = new FakeClient();
  const attestation = { ...manifest(), jobDeadline: '2026-08-21T12:00:59.000Z' };
  const canonical = canonicalAttestation(attestation);
  const fingerprint = await sha256Hex(canonical);
  fake.responses.set('consume_media_scanner_nonce', { data: { accepted: true }, error: null });
  fake.responses.set('get_media_scan_attempt_status', {
    data: statusReceipt({ processingDeadline: '2026-08-21T12:00:59.000Z' }),
    error: null,
  });
  const response = await createScannerControlHandler(dependencies(fake))(
    await signedRequest('complete', {
      operationId,
      finalizeOperationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      nonceOperationId,
      attemptId,
      attemptToken: '88888888-8888-4888-8888-888888888888',
      manifestFingerprint: fingerprint,
      manifest: attestation,
      attestationSignature: await hmacHex(config.attestationSecret, canonical),
    }, attemptId),
  );
  assertEquals(response.status >= 400, true);
  assertEquals(fake.calls.some((call) => call.kind === 'copy'), false);
  assertEquals(
    fake.calls.some((call) =>
      call.kind === 'rpc' &&
      ['record_media_scan_attestation', 'finalize_media_scan_job'].includes(
        (call.detail as { name: string }).name,
      )
    ),
    false,
  );
});

Deno.test('an attempt cannot attest or promote at the exact finalization deadline', async () => {
  const fake = new FakeClient();
  const attestation = manifest();
  const canonical = canonicalAttestation(attestation);
  const fingerprint = await sha256Hex(canonical);
  fake.responses.set('consume_media_scanner_nonce', { data: { accepted: true }, error: null });
  fake.responses.set('get_media_scan_attempt_status', {
    data: statusReceipt({ finalizationDeadline: now.toISOString() }),
    error: null,
  });
  fake.responses.set('record_media_scan_attestation', {
    data: { attemptId, status: 'attested' },
    error: null,
  });
  fake.responses.set('finalize_media_scan_job', {
    data: { status: 'clean', sanitized: true, mimeType: 'image/png', sizeBytes: 1024 },
    error: null,
  });

  const response = await createScannerControlHandler(dependencies(fake))(
    await signedRequest('complete', {
      operationId,
      finalizeOperationId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      nonceOperationId,
      attemptId,
      attemptToken: '88888888-8888-4888-8888-888888888888',
      manifestFingerprint: fingerprint,
      manifest: attestation,
      attestationSignature: await hmacHex(config.attestationSecret, canonical),
    }, attemptId),
  );

  assertEquals(response.status, 409);
  assertEquals(fake.calls.some((call) => call.kind === 'copy'), false);
  assertEquals(
    fake.calls.some((call) =>
      call.kind === 'rpc' &&
      ['record_media_scan_attestation', 'finalize_media_scan_job'].includes(
        (call.detail as { name: string }).name,
      )
    ),
    false,
  );
});

Deno.test('failure response preserves the database terminal decision on the final attempt', async () => {
  const fake = new FakeClient();
  fake.responses.set('consume_media_scanner_nonce', { data: { accepted: true }, error: null });
  fake.responses.set('fail_media_scan_attempt', {
    data: { status: 'terminal_failure', terminalCategory: 'scan_attempt_limit' },
    error: null,
  });
  fake.responses.set('get_media_scan_attempt_status', {
    data: statusReceipt(),
    error: null,
  });
  const response = await createScannerControlHandler(dependencies(fake))(
    await signedRequest('fail', {
      operationId,
      nonceOperationId,
      attemptId,
      attemptToken: '88888888-8888-4888-8888-888888888888',
      failureCategory: 'scanner_unavailable',
    }, attemptId),
  );
  assertEquals(response.status, 200);
  assertEquals(await response.json(), { status: 'terminal_failure', attemptId });
});
