import { z } from 'npm:zod@4.4.3';

const encoder = new TextEncoder();
const uuid = z.uuid();
const hash = z.string().regex(/^[0-9a-f]{64}$/);
export const scannerWorkerIdSchema = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/);
const boundedVersion = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._+-]{0,63}$/);
const opaquePath = z.string().min(41).max(160).regex(
  /^[0-9a-f]{2}\/[0-9a-f]{2}\/[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
);
const mediaPurpose = z.enum([
  'request_media',
  'request_audio',
  'provider_document',
  'completion_proof',
  'support_evidence',
  'message_attachment',
]);
const acceptedMediaMime = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp',
  'audio/mp4',
  'video/mp4',
]);
const uploadMime = z.enum([
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'audio/mp4',
  'audio/webm',
  'application/pdf',
]);

export const scannerControlVersion = 'sallah-scanner-control-v1' as const;
export const scannerAttestationVersion = 'sallah-media-attestation-v1' as const;
export const scannerControlPath = '/functions/v1/scanner-control' as const;
export const maxScannerControlBodyBytes = 64 * 1024;
export const scannerRequestWindowSeconds = 30;
export const officialHostedEdgeMemoryLimitBytes = 256 * 1024 * 1024;

const scannerSecretSchema = z.string().superRefine((value, context) => {
  const bytes = encoder.encode(value).byteLength;
  if (bytes < 32 || bytes > 256) {
    context.addIssue({ code: 'custom', message: 'scanner secret must contain 32-256 UTF-8 bytes' });
  }
});

export const scannerActionSchema = z.enum([
  'claim',
  'heartbeat',
  'prepare_output',
  'authorize_readback',
  'complete',
  'reject',
  'fail',
]);
export type ScannerAction = z.infer<typeof scannerActionSchema>;

const operationFields = {
  operationId: uuid,
  nonceOperationId: uuid,
} as const;

export const claimActionSchema = z.object({
  ...operationFields,
  workerId: scannerWorkerIdSchema,
  signatureTimestamp: z.iso.datetime({ offset: true }),
  signatureMaxAgeSeconds: z.number().int().min(60).max(604_800),
}).strict();

export const heartbeatActionSchema = z.object({
  ...operationFields,
  attemptId: uuid,
  attemptToken: uuid,
}).strict();

export const prepareOutputActionSchema = z.object({
  ...operationFields,
  attemptId: uuid,
  attemptToken: uuid,
  prepareFingerprint: hash,
  inputMime: acceptedMediaMime,
  outputMime: acceptedMediaMime,
  inputSize: z.number().int().positive().max(20 * 1024 * 1024),
  outputSize: z.number().int().positive().max(20 * 1024 * 1024),
  inputSha256: hash,
  outputSha256: hash,
  sanitizer: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
  sanitizerVersion: boundedVersion,
}).strict();

export const readbackActionSchema = z.object({
  ...operationFields,
  attemptId: uuid,
  attemptToken: uuid,
  outputSize: z.number().int().positive().max(20 * 1024 * 1024),
  outputSha256: hash,
}).strict();

export const scannerAttestationSchema = z.object({
  schemaVersion: z.literal(scannerAttestationVersion),
  attemptId: uuid,
  inputRef: opaquePath,
  outputRef: opaquePath,
  purpose: mediaPurpose,
  detectedInputMime: acceptedMediaMime,
  detectedOutputMime: acceptedMediaMime,
  inputSize: z.number().int().positive().max(20 * 1024 * 1024),
  outputSize: z.number().int().positive().max(20 * 1024 * 1024),
  inputSha256: hash,
  outputSha256: hash,
  originalScan: z.literal('clean'),
  finalScan: z.literal('clean'),
  sanitized: z.literal(true),
  sanitizer: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
  sanitizerVersion: boundedVersion,
  clamavEngineVersion: boundedVersion,
  signatureVersion: boundedVersion,
  signatureTimestamp: z.iso.datetime({ offset: true }),
  signatureAgeSeconds: z.number().int().min(0).max(604_800),
  processingDurationMs: z.number().int().min(0).max(120_000),
  jobDeadline: z.iso.datetime({ offset: true }),
  nonce: uuid,
  correlationId: uuid,
  readbackSha256: hash,
  storageFingerprint: z.string().regex(/^[0-9a-f]{32,64}$/),
}).strict();
export type ScannerAttestation = z.infer<typeof scannerAttestationSchema>;

export const completeActionSchema = z.object({
  ...operationFields,
  finalizeOperationId: uuid,
  attemptId: uuid,
  attemptToken: uuid,
  manifestFingerprint: hash,
  manifest: scannerAttestationSchema,
  attestationSignature: hash,
}).strict().superRefine((value, context) => {
  if (
    value.finalizeOperationId === value.operationId ||
    value.finalizeOperationId === value.nonceOperationId
  ) {
    context.addIssue({ code: 'custom', message: 'operation identifiers must differ' });
  }
});

export const dispositionActionSchema = z.object({
  ...operationFields,
  attemptId: uuid,
  attemptToken: uuid,
  failureCategory: z.string().regex(/^[a-z][a-z0-9_]{0,63}$/),
}).strict();

export const scanClaimReceiptSchema = z.object({
  status: z.literal('scanning'),
  jobId: uuid,
  attemptId: uuid,
  workerId: scannerWorkerIdSchema,
  attemptOrdinal: z.number().int().min(1).max(3),
  claimedAt: z.iso.datetime({ offset: true }),
  processingDeadline: z.iso.datetime({ offset: true }),
  leaseExpiresAt: z.iso.datetime({ offset: true }),
  purpose: mediaPurpose,
  declaredMimeType: uploadMime,
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
  maxSizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
  sourceBucket: z.literal('quarantine'),
  sourcePath: z.string().min(1).max(500),
  inputBucket: z.literal('scan-input'),
  inputPath: opaquePath,
  outputBucket: z.literal('scan-output'),
  outputPath: opaquePath,
  finalBucket: z.string().min(1).max(100),
  finalPath: z.string().min(1).max(500),
}).strict();
export type ScanClaimReceipt = z.infer<typeof scanClaimReceiptSchema>;

const nullableText = z.string().min(1).max(160).nullable();
const nullableNumber = z.number().int().nullable();
export const scanAttemptStatusReceiptSchema = z.object({
  jobId: uuid,
  attemptId: uuid,
  workerId: scannerWorkerIdSchema,
  jobState: z.enum([
    'queued',
    'scanning',
    'clean',
    'rejected',
    'retryable_failure',
    'terminal_failure',
  ]),
  attemptState: z.enum([
    'processing',
    'output_prepared',
    'readback_authorized',
    'attested',
    'completed',
    'rejected',
    'retryable_failure',
    'terminal_failure',
    'expired',
  ]),
  current: z.boolean(),
  claimedAt: z.iso.datetime({ offset: true }),
  processingDeadline: z.iso.datetime({ offset: true }),
  finalizationDeadline: z.iso.datetime({ offset: true }).nullable(),
  purpose: mediaPurpose,
  declaredMimeType: uploadMime,
  detectedInputMime: acceptedMediaMime.nullable(),
  detectedOutputMime: acceptedMediaMime.nullable(),
  inputSize: nullableNumber,
  outputSize: nullableNumber,
  inputSha256: hash.nullable(),
  outputSha256: hash.nullable(),
  sanitizer: nullableText,
  sanitizerVersion: nullableText,
  manifestFingerprint: hash.nullable(),
  inputBucket: z.literal('scan-input'),
  inputPath: opaquePath,
  inputArtifactState: z.string().min(1).max(64),
  outputBucket: z.literal('scan-output'),
  outputPath: opaquePath,
  outputArtifactState: z.string().min(1).max(64),
  finalBucket: z.string().min(1).max(100),
  finalPath: z.string().min(1).max(500),
  finalArtifactState: z.string().min(1).max(64),
}).strict();
export type ScanAttemptStatusReceipt = z.infer<typeof scanAttemptStatusReceiptSchema>;

export type ScannerRuntimeConfig = {
  appEnv: 'local' | 'test' | 'preview' | 'production';
  mode: 'deterministic' | 'external';
  controlSecret: string;
  attestationSecret: string;
  storageOrigin: string;
  controlOrigin: string;
  signatureMaxAgeSeconds: number;
};

export function parseAppEnvironment(
  value: string | undefined,
): ScannerRuntimeConfig['appEnv'] {
  return z.enum(['local', 'test', 'preview', 'production']).parse(value);
}

function exactOrigin(value: string, localOrTest: boolean): string {
  const parsed = new URL(value);
  if (
    parsed.username || parsed.password || parsed.pathname !== '/' || parsed.search || parsed.hash ||
    (parsed.protocol !== 'https:' && !(localOrTest && parsed.protocol === 'http:'))
  ) throw new Error('SCANNER_ORIGIN_INVALID');
  if (!localOrTest && parsed.port) throw new Error('SCANNER_ORIGIN_INVALID');
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!localOrTest && (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':'))) {
    throw new Error('SCANNER_ORIGIN_INVALID');
  }
  return parsed.origin;
}

export function parseScannerRuntimeConfig(
  input: Record<string, string | undefined>,
): ScannerRuntimeConfig {
  const appEnv = parseAppEnvironment(input.APP_ENV);
  const localOrTest = appEnv === 'local' || appEnv === 'test';
  const mode = z.enum(['deterministic', 'external']).parse(input.UPLOAD_SCANNER_MODE);
  if (!localOrTest && mode !== 'external') throw new Error('SCANNER_MODE_FORBIDDEN');
  const controlSecret = scannerSecretSchema.parse(input.UPLOAD_SCANNER_CONTROL_SECRET);
  const attestationSecret = scannerSecretSchema.parse(
    input.UPLOAD_SCANNER_ATTESTATION_SECRET,
  );
  if (controlSecret === attestationSecret) throw new Error('SCANNER_SECRETS_MUST_DIFFER');
  const hours = z.coerce.number().int().min(1).max(168).parse(
    input.UPLOAD_SCANNER_SIGNATURE_MAX_AGE_HOURS,
  );
  return {
    appEnv,
    mode,
    controlSecret,
    attestationSecret,
    storageOrigin: exactOrigin(String(input.UPLOAD_SCANNER_STORAGE_ORIGIN ?? ''), localOrTest),
    controlOrigin: exactOrigin(String(input.UPLOAD_SCANNER_CONTROL_ORIGIN ?? ''), localOrTest),
    signatureMaxAgeSeconds: hours * 60 * 60,
  };
}

export async function sha256Hex(value: string): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function canonicalControlRequest(input: {
  method: string;
  path: string;
  workerId: string;
  action: ScannerAction;
  attemptId: string;
  timestamp: number;
  nonce: string;
  bodySha256: string;
}): string {
  if (input.method !== 'POST' || input.path !== scannerControlPath) {
    throw new Error('SCANNER_REQUEST_TARGET_INVALID');
  }
  scannerActionSchema.parse(input.action);
  scannerWorkerIdSchema.parse(input.workerId);
  if (input.attemptId !== '-') uuid.parse(input.attemptId);
  uuid.parse(input.nonce);
  hash.parse(input.bodySha256);
  z.number().int().nonnegative().parse(input.timestamp);
  return [
    scannerControlVersion,
    input.workerId,
    input.method,
    input.path,
    input.action,
    input.attemptId,
    String(input.timestamp),
    input.nonce,
    input.bodySha256,
  ].join('\n');
}

async function hmacBytes(secret: string, message: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  return new Uint8Array(await crypto.subtle.sign('HMAC', key, encoder.encode(message)));
}

export async function hmacHex(secret: string, message: string): Promise<string> {
  return [...await hmacBytes(secret, message)]
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function verifyHmacHex(
  secret: string,
  message: string,
  presented: string,
): Promise<boolean> {
  if (!/^[0-9a-f]{64}$/.test(presented)) return false;
  const expected = await hmacBytes(secret, message);
  const actual = Uint8Array.from(presented.match(/../g) ?? [], (pair) => Number.parseInt(pair, 16));
  let difference = expected.length ^ actual.length;
  for (let index = 0; index < expected.length; index += 1) {
    difference |= (expected[index] ?? 0) ^ (actual[index] ?? 0);
  }
  return difference === 0;
}

export async function deterministicAttemptToken(
  secret: string,
  operationId: string,
): Promise<string> {
  uuid.parse(operationId);
  const bytes = await hmacBytes(secret, `attempt-token\n${operationId}`);
  const selected = bytes.slice(0, 16);
  selected[6] = ((selected[6] ?? 0) & 0x0f) | 0x40;
  selected[8] = ((selected[8] ?? 0) & 0x3f) | 0x80;
  const hexValue = [...selected].map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `${hexValue.slice(0, 8)}-${hexValue.slice(8, 12)}-${hexValue.slice(12, 16)}-${
    hexValue.slice(16, 20)
  }-${hexValue.slice(20)}`;
}

export async function readBoundedJson(request: Request, maxBytes = maxScannerControlBodyBytes) {
  const contentLength = request.headers.get('content-length');
  if (
    contentLength &&
    (!/^\d+$/.test(contentLength) || Number(contentLength) > maxBytes)
  ) {
    throw new Error('SCANNER_REQUEST_TOO_LARGE');
  }
  const reader = request.body?.getReader();
  if (!reader) throw new Error('SCANNER_REQUEST_INVALID');
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel('SCANNER_REQUEST_TOO_LARGE');
      throw new Error('SCANNER_REQUEST_TOO_LARGE');
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  try {
    return { text, value: JSON.parse(text) as unknown };
  } catch {
    throw new Error('SCANNER_REQUEST_INVALID');
  }
}

export function validateSignedCapability(
  value: string,
  expectedOrigin: string,
  appEnv: ScannerRuntimeConfig['appEnv'],
  expectedPath: string,
): URL {
  const parsed = new URL(value);
  const localOrTest = appEnv === 'local' || appEnv === 'test';
  if (
    parsed.origin !== expectedOrigin || parsed.pathname !== expectedPath || parsed.hash ||
    parsed.username || parsed.password ||
    (parsed.protocol !== 'https:' && !(localOrTest && parsed.protocol === 'http:')) ||
    (!localOrTest && parsed.port)
  ) throw new Error('SIGNED_CAPABILITY_INVALID');
  const host = parsed.hostname.replace(/^\[|\]$/g, '').toLowerCase();
  if (!localOrTest && (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(host) || host.includes(':'))) {
    throw new Error('SIGNED_CAPABILITY_INVALID');
  }
  return parsed;
}

export function canonicalAttestation(manifest: ScannerAttestation): string {
  return JSON.stringify(scannerAttestationSchema.parse(manifest));
}
