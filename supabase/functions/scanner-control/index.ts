import { z } from 'npm:zod@4.4.3';
import { serviceClient } from '../_shared/auth.ts';
import {
  canonicalAttestation,
  canonicalControlRequest,
  claimActionSchema,
  completeActionSchema,
  deterministicAttemptToken,
  dispositionActionSchema,
  heartbeatActionSchema,
  maxScannerControlBodyBytes,
  parseScannerRuntimeConfig,
  prepareOutputActionSchema,
  readbackActionSchema,
  readBoundedJson,
  scanAttemptStatusReceiptSchema,
  scanClaimReceiptSchema,
  scannerActionSchema,
  type ScannerAttestation,
  scannerControlPath,
  scannerRequestWindowSeconds,
  type ScannerRuntimeConfig,
  scannerWorkerIdSchema,
  sha256Hex,
  validateSignedCapability,
  verifyHmacHex,
} from '../_shared/scanner-control.ts';
import { remainingCapabilitySeconds, signS3PutCapability } from '../_shared/s3-capability.ts';

type StorageInfo = {
  size?: number;
  contentType?: string;
  mimetype?: string;
  metadata?: Record<string, unknown>;
  [key: string]: unknown;
};

export interface ScannerControlClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<{ data: unknown; error: unknown | null }>;
  storage: {
    from(bucket: string): {
      copy(
        from: string,
        to: string,
        options: { destinationBucket: string },
      ): PromiseLike<{ data: unknown | null; error: unknown | null }>;
      info(path: string): PromiseLike<{ data: StorageInfo | null; error: unknown | null }>;
      createSignedUrl(
        path: string,
        expiresIn: number,
      ): PromiseLike<{ data: { signedUrl?: string } | null; error: unknown | null }>;
    };
  };
}

type S3SigningCredentials = {
  accessKeyId: string;
  secretAccessKey: string;
  region: string;
};

export interface ScannerControlDependencies {
  createServiceClient(): ScannerControlClient;
  runtimeConfig(): ScannerRuntimeConfig;
  storageServiceOrigin(): string;
  s3SigningCredentials(): S3SigningCredentials;
  now(): Date;
  log(entry: Record<string, unknown>): void;
}

function serviceOriginFromEnvironment(): string {
  const value = Deno.env.get('SUPABASE_URL');
  if (!value) throw new Error('SERVER_CONFIG');
  const parsed = new URL(value);
  if (
    parsed.username !== '' || parsed.password !== '' || parsed.pathname !== '/' ||
    parsed.search !== '' || parsed.hash !== ''
  ) throw new Error('SERVER_CONFIG');
  return parsed.origin;
}

const defaultDependencies: ScannerControlDependencies = {
  createServiceClient: serviceClient,
  runtimeConfig: () =>
    parseScannerRuntimeConfig({
      APP_ENV: Deno.env.get('APP_ENV'),
      UPLOAD_SCANNER_MODE: Deno.env.get('UPLOAD_SCANNER_MODE'),
      UPLOAD_SCANNER_CONTROL_SECRET: Deno.env.get('UPLOAD_SCANNER_CONTROL_SECRET'),
      UPLOAD_SCANNER_ATTESTATION_SECRET: Deno.env.get('UPLOAD_SCANNER_ATTESTATION_SECRET'),
      UPLOAD_SCANNER_STORAGE_ORIGIN: Deno.env.get('UPLOAD_SCANNER_STORAGE_ORIGIN'),
      UPLOAD_SCANNER_CONTROL_ORIGIN: Deno.env.get('UPLOAD_SCANNER_CONTROL_ORIGIN'),
      UPLOAD_SCANNER_SIGNATURE_MAX_AGE_HOURS: Deno.env.get(
        'UPLOAD_SCANNER_SIGNATURE_MAX_AGE_HOURS',
      ),
    }),
  storageServiceOrigin: serviceOriginFromEnvironment,
  s3SigningCredentials: () => ({
    accessKeyId: Deno.env.get('UPLOAD_SCANNER_STORAGE_S3_ACCESS_KEY_ID') ?? '',
    secretAccessKey: Deno.env.get('UPLOAD_SCANNER_STORAGE_S3_SECRET_ACCESS_KEY') ?? '',
    region: Deno.env.get('UPLOAD_SCANNER_STORAGE_S3_REGION') ?? '',
  }),
  now: () => new Date(),
  log: (entry) => console.log(JSON.stringify(entry)),
};

const operationSchema = z.object({
  operationId: z.uuid(),
  nonceOperationId: z.uuid(),
}).passthrough().superRefine((value, context) => {
  if (value.operationId === value.nonceOperationId) {
    context.addIssue({ code: 'custom', message: 'operation identifiers must differ' });
  }
});

const prepareReceiptSchema = z.object({
  attemptId: z.uuid(),
  status: z.literal('output_prepared'),
  outputBucket: z.literal('scan-output'),
  outputPath: z.string().min(1).max(160),
  processingDeadline: z.iso.datetime({ offset: true }),
  upsert: z.literal(false),
  purpose: z.string().min(1).max(80),
  detectedInputMime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'audio/mp4', 'video/mp4']),
  detectedOutputMime: z.enum(['image/jpeg', 'image/png', 'image/webp', 'audio/mp4', 'video/mp4']),
  jobDeadline: z.iso.datetime({ offset: true }),
}).strict();

const readbackReceiptSchema = z.object({
  attemptId: z.uuid(),
  status: z.literal('readback_authorized'),
  outputBucket: z.literal('scan-output'),
  outputPath: z.string().min(1).max(160),
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
  sha256: z.string().regex(/^[0-9a-f]{64}$/),
}).strict();

const safeFinalizedSchema = z.object({
  status: z.literal('clean'),
  sanitized: z.literal(true),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'audio/mp4', 'video/mp4']),
  sizeBytes: z.number().int().positive().max(20 * 1024 * 1024),
});

const dispositionReceiptSchema = z.object({
  status: z.enum(['rejected', 'retryable_failure', 'terminal_failure']),
});

function response(body: unknown, status = 200): Response {
  return Response.json(body, {
    status,
    headers: { 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function errorResponse(error: unknown): Response {
  const code = error instanceof Error && /^[A-Z0-9_]{3,80}$/.test(error.message)
    ? error.message
    : 'SCANNER_CONTROL_FAILED';
  const status = code === 'SCANNER_AUTH_INVALID'
    ? 401
    : /STALE|EXPIRED|MISMATCH|REPLAY/.test(code)
    ? 409
    : /INVALID|FORBIDDEN|TOO_LARGE|OUTSIDE_WINDOW/.test(code)
    ? 400
    : 503;
  return response(
    { error: status === 401 ? 'unauthorized' : 'scanner_control_unavailable' },
    status,
  );
}

function infoMime(info: StorageInfo): string | undefined {
  if (typeof info.contentType === 'string') return info.contentType;
  if (typeof info.mimetype === 'string') return info.mimetype;
  const candidate = info.metadata?.mimetype ?? info.metadata?.contentType;
  return typeof candidate === 'string' ? candidate : undefined;
}

function infoFingerprint(info: StorageInfo): string {
  const candidate = info.eTag ?? info.etag ?? info.metadata?.eTag ?? info.metadata?.etag;
  if (typeof candidate !== 'string') throw new Error('STORAGE_OBJECT_FINGERPRINT_MISSING');
  const normalized = candidate.trim().replace(/^"|"$/g, '').toLowerCase();
  if (!/^[0-9a-f]{32,64}$/.test(normalized)) {
    throw new Error('STORAGE_OBJECT_FINGERPRINT_INVALID');
  }
  return normalized;
}

async function exactInfo(
  db: ScannerControlClient,
  bucket: string,
  path: string,
  size: number,
  mime: string,
): Promise<string> {
  const result = await db.storage.from(bucket).info(path);
  if (result.error || !result.data || result.data.size !== size || infoMime(result.data) !== mime) {
    throw new Error('STORAGE_OBJECT_METADATA_MISMATCH');
  }
  return infoFingerprint(result.data);
}

type ScanAttemptStatus = z.infer<typeof scanAttemptStatusReceiptSchema>;
type ScanAttemptState = ScanAttemptStatus['attemptState'];

async function requireLiveAttempt(
  db: ScannerControlClient,
  attemptId: string,
  attemptToken: string,
  now: () => Date,
  allowedStates: readonly ScanAttemptState[],
): Promise<ScanAttemptStatus> {
  const result = await db.rpc('get_media_scan_attempt_status', {
    p_attempt_id: attemptId,
    p_attempt_token: attemptToken,
  });
  if (result.error) throw new Error('SCAN_ATTEMPT_STALE');
  const receipt = scanAttemptStatusReceiptSchema.parse(result.data);
  const checkedAt = now();
  if (
    receipt.attemptId !== attemptId || !receipt.current || receipt.jobState !== 'scanning' ||
    !allowedStates.includes(receipt.attemptState) ||
    checkedAt.getTime() >= new Date(receipt.processingDeadline).getTime()
  ) throw new Error('SCAN_ATTEMPT_STALE');
  return receipt;
}

async function copyAndReconcile(
  db: ScannerControlClient,
  fromBucket: string,
  fromPath: string,
  toBucket: string,
  toPath: string,
  size: number,
  mime: string,
  expectedSourceFingerprint?: string,
): Promise<void> {
  const sourceFingerprint = await exactInfo(db, fromBucket, fromPath, size, mime);
  if (expectedSourceFingerprint && sourceFingerprint !== expectedSourceFingerprint) {
    throw new Error('STORAGE_OBJECT_FINGERPRINT_MISMATCH');
  }
  const copied = await db.storage.from(fromBucket).copy(fromPath, toPath, {
    destinationBucket: toBucket,
  });
  // A transport error can be a lost success response. Reconcile only when the exact
  // attempt-bound destination has the same Storage content fingerprint as the source.
  const destinationFingerprint = await exactInfo(db, toBucket, toPath, size, mime);
  if (destinationFingerprint !== sourceFingerprint) {
    throw new Error('STORAGE_OBJECT_FINGERPRINT_MISMATCH');
  }
  if (copied.error) return;
}

function signedReadPath(bucket: string, path: string): string {
  return `/storage/v1/object/sign/${bucket}/${path}`;
}

async function signedRead(
  db: ScannerControlClient,
  config: ScannerRuntimeConfig,
  storageServiceOrigin: string,
  bucket: string,
  path: string,
  expiresIn: number,
): Promise<string> {
  const signed = await db.storage.from(bucket).createSignedUrl(path, expiresIn);
  if (signed.error || !signed.data?.signedUrl) throw new Error('SIGNED_CAPABILITY_FAILED');
  const internal = validateSignedCapability(
    signed.data.signedUrl,
    storageServiceOrigin,
    'local',
    signedReadPath(bucket, path),
  );
  const external = new URL(`${internal.pathname}${internal.search}`, `${config.storageOrigin}/`);
  return validateSignedCapability(
    external.toString(),
    config.storageOrigin,
    config.appEnv,
    signedReadPath(bucket, path),
  ).toString();
}

async function signedUpload(
  config: ScannerRuntimeConfig,
  credentials: S3SigningCredentials,
  bucket: string,
  path: string,
  contentType: 'image/jpeg' | 'image/png' | 'image/webp' | 'audio/mp4' | 'video/mp4',
  expiresIn: number,
  at: Date,
): Promise<string> {
  if (bucket !== 'scan-output') throw new Error('SIGNED_CAPABILITY_FAILED');
  const signed = await signS3PutCapability({
    origin: config.storageOrigin,
    bucket,
    path,
    contentType,
    accessKeyId: credentials.accessKeyId,
    secretAccessKey: credentials.secretAccessKey,
    region: credentials.region,
    expiresInSeconds: expiresIn,
    at,
    allowHttp: config.appEnv === 'local' || config.appEnv === 'test',
  });
  return signed.url;
}

function assertManifestAgainstReceipt(
  manifest: ScannerAttestation,
  receipt: z.infer<typeof scanAttemptStatusReceiptSchema>,
  config: ScannerRuntimeConfig,
  at: Date,
): void {
  const signatureTimestamp = new Date(manifest.signatureTimestamp);
  const calculatedAge = Math.floor((at.getTime() - signatureTimestamp.getTime()) / 1000);
  if (
    !receipt.current || receipt.jobState !== 'scanning' ||
    !['readback_authorized', 'attested'].includes(receipt.attemptState) ||
    at >= new Date(receipt.finalizationDeadline ?? receipt.processingDeadline) ||
    manifest.attemptId !== receipt.attemptId || manifest.inputRef !== receipt.inputPath ||
    manifest.outputRef !== receipt.outputPath || manifest.purpose !== receipt.purpose ||
    manifest.detectedInputMime !== receipt.detectedInputMime ||
    manifest.detectedOutputMime !== receipt.detectedOutputMime ||
    manifest.inputSize !== receipt.inputSize || manifest.outputSize !== receipt.outputSize ||
    manifest.inputSha256 !== receipt.inputSha256 ||
    manifest.outputSha256 !== receipt.outputSha256 ||
    manifest.readbackSha256 !== receipt.outputSha256 || manifest.sanitizer !== receipt.sanitizer ||
    manifest.sanitizerVersion !== receipt.sanitizerVersion ||
    manifest.jobDeadline !== receipt.processingDeadline ||
    calculatedAge < 0 || calculatedAge > config.signatureMaxAgeSeconds ||
    manifest.signatureAgeSeconds > config.signatureMaxAgeSeconds ||
    Math.abs(manifest.signatureAgeSeconds - calculatedAge) > 5
  ) throw new Error('SCANNER_ATTESTATION_MISMATCH');
}

async function parseAuthenticatedRequest(
  request: Request,
  config: ScannerRuntimeConfig,
  at: Date,
) {
  const requestUrl = new URL(request.url);
  const isPublicTarget = requestUrl.origin === config.controlOrigin &&
    requestUrl.pathname === scannerControlPath;
  const isLocalEdgeRuntimeTarget = (config.appEnv === 'local' || config.appEnv === 'test') &&
    requestUrl.origin === 'http://127.0.0.1:8081' && requestUrl.pathname === '/scanner-control';
  // Managed Supabase dispatches the public invocation to the function-prefixed
  // route. Its internal origin is not a stable public contract, so bind the exact
  // routed path and keep the signed canonical path public and fixed. HMAC remains
  // the authentication boundary.
  const isManagedEdgeRuntimeTarget =
    (config.appEnv === 'preview' || config.appEnv === 'production') &&
    requestUrl.pathname === '/scanner-control';
  if (
    request.method !== 'POST' || requestUrl.username !== '' || requestUrl.password !== '' ||
    requestUrl.search !== '' || requestUrl.hash !== '' ||
    (!isPublicTarget && !isLocalEdgeRuntimeTarget && !isManagedEdgeRuntimeTarget)
  ) {
    throw new Error('SCANNER_AUTH_INVALID');
  }
  const action = scannerActionSchema.parse(request.headers.get('x-sallah-scanner-action'));
  const attempt = request.headers.get('x-sallah-scanner-attempt') ?? '';
  const workerId = scannerWorkerIdSchema.parse(request.headers.get('x-sallah-scanner-worker'));
  const timestamp = Number(request.headers.get('x-sallah-scanner-timestamp'));
  const nonce = z.uuid().parse(request.headers.get('x-sallah-scanner-nonce'));
  const signature = request.headers.get('x-sallah-scanner-signature') ?? '';
  if (
    !Number.isSafeInteger(timestamp) ||
    Math.abs(Math.floor(at.getTime() / 1000) - timestamp) > scannerRequestWindowSeconds
  ) {
    throw new Error('SCANNER_TIMESTAMP_OUTSIDE_WINDOW');
  }
  const body = await readBoundedJson(request, maxScannerControlBodyBytes);
  const bodySha256 = await sha256Hex(body.text);
  const canonical = canonicalControlRequest({
    method: request.method,
    path: scannerControlPath,
    workerId,
    action,
    attemptId: attempt,
    timestamp,
    nonce,
    bodySha256,
  });
  if (!await verifyHmacHex(config.controlSecret, canonical, signature)) {
    throw new Error('SCANNER_AUTH_INVALID');
  }
  const operations = operationSchema.parse(body.value);
  return { action, attempt, workerId, timestamp, nonce, bodySha256, body: body.value, operations };
}

export function createScannerControlHandler(dependencies: ScannerControlDependencies) {
  return async (request: Request): Promise<Response> => {
    try {
      const config = dependencies.runtimeConfig();
      const storageServiceOrigin = dependencies.storageServiceOrigin();
      const s3Credentials = dependencies.s3SigningCredentials();
      const at = dependencies.now();
      const authenticated = await parseAuthenticatedRequest(request, config, at);
      const db = dependencies.createServiceClient();
      const nonceResult = await db.rpc('consume_media_scanner_nonce', {
        p_worker_id: authenticated.workerId,
        p_action: authenticated.action,
        p_nonce: authenticated.nonce,
        p_request_timestamp: authenticated.timestamp,
        p_body_sha256: authenticated.bodySha256,
        p_operation_id: authenticated.operations.nonceOperationId,
      });
      if (nonceResult.error) throw new Error('SCANNER_NONCE_REPLAY');

      if (authenticated.action === 'claim') {
        if (authenticated.attempt !== '-') throw new Error('SCANNER_AUTH_INVALID');
        const body = claimActionSchema.parse(authenticated.body);
        if (body.workerId !== authenticated.workerId) throw new Error('SCANNER_AUTH_INVALID');
        const signatureAgeSeconds = Math.floor(
          (at.getTime() - new Date(body.signatureTimestamp).getTime()) / 1000,
        );
        if (
          body.signatureMaxAgeSeconds !== config.signatureMaxAgeSeconds ||
          signatureAgeSeconds < 0 ||
          signatureAgeSeconds > config.signatureMaxAgeSeconds
        ) throw new Error('CLAMAV_SIGNATURE_STALE');
        const attemptToken = await deterministicAttemptToken(
          config.controlSecret,
          body.operationId,
        );
        const claimed = await db.rpc('claim_media_scan_job', {
          p_worker_id: body.workerId,
          p_operation_id: body.operationId,
          p_attempt_token_hash: await sha256Hex(attemptToken),
          p_signature_timestamp: body.signatureTimestamp,
          p_signature_max_age_seconds: body.signatureMaxAgeSeconds,
        });
        if (claimed.error) throw new Error('SCAN_CLAIM_FAILED');
        if (!claimed.data) return response({ status: 'idle' });
        const receipt = scanClaimReceiptSchema.parse(claimed.data);
        if (
          receipt.workerId !== authenticated.workerId ||
          at.getTime() >= new Date(receipt.processingDeadline).getTime() ||
          receipt.leaseExpiresAt !== receipt.processingDeadline
        ) throw new Error('SCAN_ATTEMPT_EXPIRED');
        const assertLiveClaim = async () => {
          const live = await requireLiveAttempt(
            db,
            receipt.attemptId,
            attemptToken,
            dependencies.now,
            ['processing'],
          );
          if (
            live.jobId !== receipt.jobId ||
            live.workerId !== authenticated.workerId ||
            live.processingDeadline !== receipt.processingDeadline ||
            live.purpose !== receipt.purpose ||
            live.declaredMimeType !== receipt.declaredMimeType ||
            live.inputBucket !== receipt.inputBucket || live.inputPath !== receipt.inputPath ||
            live.outputBucket !== receipt.outputBucket || live.outputPath !== receipt.outputPath ||
            live.finalBucket !== receipt.finalBucket || live.finalPath !== receipt.finalPath
          ) throw new Error('SCAN_ATTEMPT_STALE');
        };
        await assertLiveClaim();
        await copyAndReconcile(
          db,
          receipt.sourceBucket,
          receipt.sourcePath,
          receipt.inputBucket,
          receipt.inputPath,
          receipt.sizeBytes,
          receipt.declaredMimeType,
        );
        await assertLiveClaim();
        const capabilityAt = dependencies.now();
        if (capabilityAt.getTime() >= new Date(receipt.processingDeadline).getTime()) {
          throw new Error('SCAN_ATTEMPT_EXPIRED');
        }
        const seconds = remainingCapabilitySeconds(
          receipt.processingDeadline,
          capabilityAt,
          120,
        );
        const inputUrl = await signedRead(
          db,
          config,
          storageServiceOrigin,
          receipt.inputBucket,
          receipt.inputPath,
          seconds,
        );
        return response({
          status: 'claimed',
          attemptId: receipt.attemptId,
          attemptToken,
          attemptOrdinal: receipt.attemptOrdinal,
          processingDeadline: receipt.processingDeadline,
          purpose: receipt.purpose,
          declaredMimeType: receipt.declaredMimeType,
          sizeBytes: receipt.sizeBytes,
          maxSizeBytes: receipt.maxSizeBytes,
          inputRef: receipt.inputPath,
          inputUrl,
        });
      }

      if (authenticated.attempt === '-') throw new Error('SCANNER_AUTH_INVALID');
      const common = z.object({ attemptId: z.uuid(), attemptToken: z.uuid() }).passthrough().parse(
        authenticated.body,
      );
      if (common.attemptId !== authenticated.attempt) throw new Error('SCANNER_AUTH_INVALID');
      const identity = await db.rpc('get_media_scan_attempt_status', {
        p_attempt_id: common.attemptId,
        p_attempt_token: common.attemptToken,
      });
      if (identity.error) throw new Error('SCAN_ATTEMPT_STALE');
      const identityReceipt = scanAttemptStatusReceiptSchema.parse(identity.data);
      if (
        identityReceipt.attemptId !== common.attemptId ||
        identityReceipt.workerId !== authenticated.workerId
      ) throw new Error('SCANNER_AUTH_INVALID');
      if (
        ['heartbeat', 'prepare_output', 'authorize_readback'].includes(authenticated.action) &&
        (!identityReceipt.current || identityReceipt.jobState !== 'scanning' ||
          at.getTime() >= new Date(identityReceipt.processingDeadline).getTime())
      ) throw new Error('SCAN_ATTEMPT_STALE');

      if (authenticated.action === 'heartbeat') {
        const body = heartbeatActionSchema.parse(authenticated.body);
        const result = await db.rpc('heartbeat_media_scan_attempt', {
          p_attempt_id: body.attemptId,
          p_attempt_token: body.attemptToken,
          p_operation_id: body.operationId,
        });
        if (result.error) throw new Error('SCAN_ATTEMPT_STALE');
        return response({ status: 'scanning', attemptId: body.attemptId });
      }

      if (authenticated.action === 'prepare_output') {
        const body = prepareOutputActionSchema.parse(authenticated.body);
        const result = await db.rpc('prepare_media_scan_output', {
          p_attempt_id: body.attemptId,
          p_attempt_token: body.attemptToken,
          p_operation_id: body.operationId,
          p_prepare_fingerprint: body.prepareFingerprint,
          p_input_mime_type: body.inputMime,
          p_output_mime_type: body.outputMime,
          p_input_size_bytes: body.inputSize,
          p_output_size_bytes: body.outputSize,
          p_input_sha256: body.inputSha256,
          p_output_sha256: body.outputSha256,
          p_sanitizer_id: body.sanitizer,
          p_sanitizer_version: body.sanitizerVersion,
        });
        if (result.error) throw new Error('SCAN_ATTEMPT_STALE');
        const receipt = prepareReceiptSchema.parse(result.data);
        if (
          at.getTime() >= new Date(receipt.processingDeadline).getTime() ||
          receipt.jobDeadline !== receipt.processingDeadline
        ) throw new Error('SCAN_ATTEMPT_EXPIRED');
        const live = await requireLiveAttempt(
          db,
          body.attemptId,
          body.attemptToken,
          dependencies.now,
          ['output_prepared'],
        );
        if (
          live.processingDeadline !== receipt.processingDeadline ||
          live.outputBucket !== receipt.outputBucket || live.outputPath !== receipt.outputPath ||
          live.purpose !== receipt.purpose ||
          live.detectedInputMime !== receipt.detectedInputMime ||
          live.detectedOutputMime !== receipt.detectedOutputMime
        ) throw new Error('SCAN_ATTEMPT_STALE');
        const capabilityAt = dependencies.now();
        const expiresIn = remainingCapabilitySeconds(
          receipt.processingDeadline,
          capabilityAt,
          120,
        );
        const uploadUrl = await signedUpload(
          config,
          s3Credentials,
          receipt.outputBucket,
          receipt.outputPath,
          receipt.detectedOutputMime,
          expiresIn,
          capabilityAt,
        );
        return response({
          status: receipt.status,
          attemptId: receipt.attemptId,
          outputRef: receipt.outputPath,
          uploadUrl,
          upsert: false,
          processingDeadline: receipt.processingDeadline,
        });
      }

      if (authenticated.action === 'authorize_readback') {
        const body = readbackActionSchema.parse(authenticated.body);
        const trusted = await requireLiveAttempt(
          db,
          body.attemptId,
          body.attemptToken,
          dependencies.now,
          ['output_prepared', 'readback_authorized'],
        );
        if (
          trusted.outputSize !== body.outputSize || trusted.outputSha256 !== body.outputSha256
        ) {
          throw new Error('OUTPUT_METADATA_MISMATCH');
        }
        await exactInfo(
          db,
          trusted.outputBucket,
          trusted.outputPath,
          body.outputSize,
          trusted.detectedOutputMime ?? '',
        );
        const authorized = await db.rpc('authorize_media_scan_readback', {
          p_attempt_id: body.attemptId,
          p_attempt_token: body.attemptToken,
          p_operation_id: body.operationId,
          p_output_size_bytes: body.outputSize,
          p_output_sha256: body.outputSha256,
        });
        if (authorized.error) throw new Error('SCAN_ATTEMPT_STALE');
        const receipt = readbackReceiptSchema.parse(authorized.data);
        const live = await requireLiveAttempt(
          db,
          body.attemptId,
          body.attemptToken,
          dependencies.now,
          ['readback_authorized'],
        );
        if (
          live.outputBucket !== receipt.outputBucket || live.outputPath !== receipt.outputPath ||
          live.outputSize !== receipt.sizeBytes || live.outputSha256 !== receipt.sha256
        ) throw new Error('SCAN_ATTEMPT_STALE');
        const capabilityAt = dependencies.now();
        const expiresIn = remainingCapabilitySeconds(
          live.processingDeadline,
          capabilityAt,
          120,
        );
        const readUrl = await signedRead(
          db,
          config,
          storageServiceOrigin,
          receipt.outputBucket,
          receipt.outputPath,
          expiresIn,
        );
        return response({
          status: receipt.status,
          attemptId: receipt.attemptId,
          outputRef: receipt.outputPath,
          readUrl,
        });
      }

      if (authenticated.action === 'complete') {
        const body = completeActionSchema.parse(authenticated.body);
        const canonical = canonicalAttestation(body.manifest);
        if (
          await sha256Hex(canonical) !== body.manifestFingerprint ||
          !await verifyHmacHex(config.attestationSecret, canonical, body.attestationSignature)
        ) throw new Error('SCANNER_ATTESTATION_MISMATCH');
        const status = await db.rpc('get_media_scan_attempt_status', {
          p_attempt_id: body.attemptId,
          p_attempt_token: body.attemptToken,
        });
        if (status.error) throw new Error('SCAN_ATTEMPT_STALE');
        const trusted = scanAttemptStatusReceiptSchema.parse(status.data);

        if (
          trusted.jobState === 'clean' && trusted.attemptState === 'completed' &&
          trusted.finalArtifactState === 'retained' &&
          trusted.manifestFingerprint === body.manifestFingerprint
        ) {
          const replay = await db.rpc('finalize_media_scan_job', {
            p_attempt_id: body.attemptId,
            p_attempt_token: body.attemptToken,
            p_operation_id: body.finalizeOperationId,
            p_manifest_fingerprint: body.manifestFingerprint,
          });
          if (replay.error) throw new Error('SCAN_FINALIZATION_FAILED');
          const safe = safeFinalizedSchema.parse(replay.data);
          return response({ ...safe, attemptId: body.attemptId });
        }

        assertManifestAgainstReceipt(body.manifest, trusted, config, at);
        const stagedFingerprint = await exactInfo(
          db,
          trusted.outputBucket,
          trusted.outputPath,
          body.manifest.outputSize,
          body.manifest.detectedOutputMime,
        );
        if (stagedFingerprint !== body.manifest.storageFingerprint) {
          throw new Error('STORAGE_OBJECT_FINGERPRINT_MISMATCH');
        }
        const attested = await db.rpc('record_media_scan_attestation', {
          p_attempt_id: body.attemptId,
          p_attempt_token: body.attemptToken,
          p_operation_id: body.operationId,
          p_manifest_fingerprint: body.manifestFingerprint,
          p_manifest: body.manifest,
        });
        if (attested.error) throw new Error('SCAN_ATTESTATION_FAILED');
        await copyAndReconcile(
          db,
          trusted.outputBucket,
          trusted.outputPath,
          trusted.finalBucket,
          trusted.finalPath,
          body.manifest.outputSize,
          body.manifest.detectedOutputMime,
          body.manifest.storageFingerprint,
        );
        const finalized = await db.rpc('finalize_media_scan_job', {
          p_attempt_id: body.attemptId,
          p_attempt_token: body.attemptToken,
          p_operation_id: body.finalizeOperationId,
          p_manifest_fingerprint: body.manifestFingerprint,
        });
        if (finalized.error) throw new Error('SCAN_FINALIZATION_FAILED');
        const safe = safeFinalizedSchema.parse(finalized.data);
        dependencies.log({ event: 'media_scan_completed', attemptId: body.attemptId });
        return response({
          status: safe.status,
          attemptId: body.attemptId,
          sanitized: safe.sanitized,
          mimeType: safe.mimeType,
          sizeBytes: safe.sizeBytes,
        });
      }

      const body = dispositionActionSchema.parse(authenticated.body);
      const rpcName = authenticated.action === 'reject'
        ? 'reject_media_scan_job'
        : 'fail_media_scan_attempt';
      const result = await db.rpc(rpcName, {
        p_attempt_id: body.attemptId,
        p_attempt_token: body.attemptToken,
        p_operation_id: body.operationId,
        p_failure_category: body.failureCategory,
      });
      if (result.error) throw new Error('SCAN_ATTEMPT_STALE');
      const disposition = dispositionReceiptSchema.parse(result.data);
      if (
        (authenticated.action === 'reject' && disposition.status !== 'rejected') ||
        (authenticated.action === 'fail' && disposition.status === 'rejected')
      ) throw new Error('SCAN_DISPOSITION_MISMATCH');
      return response({
        status: disposition.status,
        attemptId: body.attemptId,
      });
    } catch (error) {
      if (error instanceof z.ZodError) return response({ error: 'invalid_request' }, 400);
      const category = error instanceof Error && /^[A-Z0-9_]{3,80}$/.test(error.message)
        ? error.message
        : 'SCANNER_CONTROL_FAILED';
      dependencies.log({ event: 'media_scan_control_failed', category });
      return errorResponse(error);
    }
  };
}

export const handleScannerControl = createScannerControlHandler(defaultDependencies);

if (import.meta.main) Deno.serve(handleScannerControl);
