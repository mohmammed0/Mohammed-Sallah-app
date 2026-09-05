import {
  canonicalControlRequest,
  hmacHex,
  scannerControlPath,
  type ScannerRuntimeConfig,
  sha256Hex,
} from '../_shared/scanner-control.ts';
import {
  createScannerControlHandler,
  type ScannerControlClient,
  type ScannerControlDependencies,
} from './index.ts';

const MiB = 1024 * 1024;
const maxMediaBytes = 20 * MiB;
const attemptId = '11111111-1111-4111-8111-111111111111';
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

function parseSize(value: string | undefined): number {
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < 0 || parsed > maxMediaBytes) {
    throw new Error('EDGE_METADATA_SIZE_INVALID');
  }
  return parsed;
}

async function runScenario(
  inputSize: number,
  outputSize: number,
  syntheticProportionalAllocation = false,
) {
  const nonce = crypto.randomUUID();
  const body = {
    operationId: crypto.randomUUID(),
    nonceOperationId: crypto.randomUUID(),
    attemptId,
    attemptToken: '88888888-8888-4888-8888-888888888888',
    prepareFingerprint: '3'.repeat(64),
    inputMime: 'image/png',
    outputMime: 'image/png',
    inputSize,
    outputSize,
    inputSha256: '1'.repeat(64),
    outputSha256: '2'.repeat(64),
    sanitizer: `s${'a'.repeat(62)}`,
    sanitizerVersion: `v${'1'.repeat(62)}`,
  };
  const bodyText = JSON.stringify(body);
  const bodySha256 = await sha256Hex(bodyText);
  const timestamp = Math.floor(now.getTime() / 1000);
  const workerId = 'scanner-worker-1';
  const signature = await hmacHex(
    config.controlSecret,
    canonicalControlRequest({
      method: 'POST',
      path: scannerControlPath,
      workerId,
      action: 'prepare_output',
      attemptId,
      timestamp,
      nonce,
      bodySha256,
    }),
  );
  const statusReceipt = {
    jobId: '55555555-5555-4555-8555-555555555555',
    attemptId,
    workerId,
    jobState: 'scanning',
    attemptState: 'output_prepared',
    current: true,
    claimedAt: '2026-08-21T12:00:00.000Z',
    processingDeadline: '2026-08-21T12:02:00.000Z',
    finalizationDeadline: null,
    purpose: 'request_media',
    declaredMimeType: 'image/png',
    detectedInputMime: 'image/png',
    detectedOutputMime: 'image/png',
    inputSize,
    outputSize,
    inputSha256: body.inputSha256,
    outputSha256: body.outputSha256,
    sanitizer: body.sanitizer,
    sanitizerVersion: body.sanitizerVersion,
    manifestFingerprint: null,
    inputBucket: 'scan-input',
    inputPath,
    inputArtifactState: 'copied',
    outputBucket: 'scan-output',
    outputPath,
    outputArtifactState: 'prepared',
    finalBucket: 'request-media',
    finalPath,
    finalArtifactState: 'pending',
  };

  let rpcCalls = 0;
  const pause = () => new Promise<void>((resolve) => setTimeout(resolve, 0));
  const client: ScannerControlClient = {
    async rpc(name: string) {
      rpcCalls += 1;
      await pause();
      if (name === 'consume_media_scanner_nonce') return { data: { accepted: true }, error: null };
      if (name === 'prepare_media_scan_output') {
        return {
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
        };
      }
      if (name === 'get_media_scan_attempt_status') return { data: statusReceipt, error: null };
      return { data: null, error: { message: 'unexpected RPC' } };
    },
    storage: {
      from(_bucket: string) {
        return {
          copy() {
            return Promise.resolve({ data: null, error: { message: 'unexpected copy' } });
          },
          info() {
            return Promise.resolve({ data: null, error: { message: 'unexpected info' } });
          },
          createSignedUrl() {
            return Promise.resolve({ data: null, error: { message: 'unexpected signed read' } });
          },
          createSignedUploadUrl() {
            return Promise.resolve({ data: null, error: { message: 'unexpected signed upload' } });
          },
        };
      },
    },
  };
  const dependencies: ScannerControlDependencies = {
    createServiceClient: () => client,
    runtimeConfig: () => config,
    storageServiceOrigin: () => config.storageOrigin,
    s3SigningCredentials: () => ({
      accessKeyId: 'scanner-edge-only-access-key',
      secretAccessKey: 'scanner-edge-only-secret-that-never-leaves-edge',
      region: 'local',
    }),
    now: () => now,
    log: () => undefined,
  };
  const request = () =>
    new Request(`${config.controlOrigin}${scannerControlPath}`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        'x-sallah-scanner-action': 'prepare_output',
        'x-sallah-scanner-attempt': attemptId,
        'x-sallah-scanner-worker': workerId,
        'x-sallah-scanner-timestamp': String(timestamp),
        'x-sallah-scanner-nonce': nonce,
        'x-sallah-scanner-signature': signature,
      },
      body: bodyText,
    });
  const handler = createScannerControlHandler(dependencies);

  let syntheticAllocation: Uint8Array | undefined;
  if (syntheticProportionalAllocation) {
    syntheticAllocation = new Uint8Array(inputSize);
    for (let index = 0; index < syntheticAllocation.byteLength; index += 4096) {
      syntheticAllocation[index] = 1;
    }
  }
  const baseline = Deno.memoryUsage();
  let sampleCount = 1;
  let peakRssBytes = baseline.rss;
  let peakHeapBytes = baseline.heapUsed;
  let peakHeapTotalBytes = baseline.heapTotal;
  let peakExternalBytes = baseline.external;
  const sample = () => {
    const memory = Deno.memoryUsage();
    sampleCount += 1;
    peakRssBytes = Math.max(peakRssBytes, memory.rss);
    peakHeapBytes = Math.max(peakHeapBytes, memory.heapUsed);
    peakHeapTotalBytes = Math.max(peakHeapTotalBytes, memory.heapTotal);
    peakExternalBytes = Math.max(peakExternalBytes, memory.external);
  };
  const sampler = setInterval(sample, 1);
  let response: Response;
  let responseText: string;
  try {
    response = await handler(request());
    responseText = await response.text();
  } finally {
    clearInterval(sampler);
  }
  sample();
  const responseBytes = new TextEncoder().encode(responseText).byteLength;
  const responseBody = JSON.parse(responseText) as { uploadUrl?: string };
  const signedUploadCalls = responseBody.uploadUrl?.includes('/storage/v1/s3/scan-output/') ? 1 : 0;

  return {
    processId: Deno.pid,
    inputSize,
    outputSize,
    handlerStatus: response.status,
    rpcCalls,
    signedUploadCalls,
    sampleCount,
    baselineRssBytes: baseline.rss,
    peakRssBytes,
    baselineHeapBytes: baseline.heapUsed,
    peakHeapBytes,
    baselineHeapTotalBytes: baseline.heapTotal,
    peakHeapTotalBytes,
    baselineExternalBytes: baseline.external,
    peakExternalBytes,
    encodedBytes: new TextEncoder().encode(bodyText).byteLength,
    responseBytes,
    syntheticAllocationBytes: syntheticAllocation?.byteLength ?? 0,
  };
}

const inputSize = parseSize(Deno.args[0]);
const outputSize = parseSize(Deno.args[1]);
await runScenario(1 * MiB, 1 * MiB);
console.log(
  JSON.stringify(
    await runScenario(
      inputSize,
      outputSize,
      Deno.args[2] === '--synthetic-proportional-allocation',
    ),
  ),
);
