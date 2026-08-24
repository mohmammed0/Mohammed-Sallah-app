import { createHash, randomUUID } from 'node:crypto';

import { z } from 'zod';

import { hmacSha256Hex } from './auth.js';
import { opaqueReferenceSchema } from './manifest.js';
import { acceptedMediaMimeTypeSchema, type AcceptedMediaMimeType } from './contracts.js';

export const SCANNER_CONTROL_VERSION = 'sallah-scanner-control-v1' as const;
export const SCANNER_CONTROL_PATH = '/functions/v1/scanner-control' as const;
export const MAX_SCANNER_CONTROL_RESPONSE_BYTES = 64 * 1024;
export const DEFAULT_SCANNER_CONTROL_TIMEOUT_MS = 5_000;

export const scannerActions = [
  'claim',
  'heartbeat',
  'prepare_output',
  'authorize_readback',
  'complete',
  'reject',
  'fail',
] as const;
export type ScannerAction = (typeof scannerActions)[number];

const idleSchema = z.object({ status: z.literal('idle') }).strict();
const claimSchema = z
  .object({
    status: z.literal('claimed'),
    attemptId: z.uuid(),
    attemptToken: z.uuid(),
    attemptOrdinal: z.number().int().min(1).max(3),
    processingDeadline: z.iso.datetime({ offset: true }),
    purpose: z.enum([
      'request_media',
      'request_audio',
      'provider_document',
      'completion_proof',
      'support_evidence',
      'message_attachment',
    ]),
    declaredMimeType: z.enum([
      'image/jpeg',
      'image/png',
      'image/webp',
      'video/mp4',
      'audio/mp4',
      'audio/webm',
      'application/pdf',
    ]),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(20 * 1024 * 1024),
    maxSizeBytes: z
      .number()
      .int()
      .positive()
      .max(20 * 1024 * 1024),
    inputRef: opaqueReferenceSchema,
    inputUrl: z.url(),
  })
  .strict();
const claimResponseSchema = z.union([idleSchema, claimSchema]);
export type ScanClaim = z.infer<typeof claimSchema>;
const prepareResponseSchema = z
  .object({
    status: z.literal('output_prepared'),
    attemptId: z.uuid(),
    outputRef: opaqueReferenceSchema,
    uploadUrl: z.url(),
    upsert: z.literal(false),
    processingDeadline: z.iso.datetime({ offset: true }),
  })
  .strict();
const readbackResponseSchema = z
  .object({
    status: z.literal('readback_authorized'),
    attemptId: z.uuid(),
    outputRef: opaqueReferenceSchema,
    readUrl: z.url(),
  })
  .strict();
const completeResponseSchema = z
  .object({
    status: z.literal('clean'),
    attemptId: z.uuid(),
    sanitized: z.literal(true),
    mimeType: acceptedMediaMimeTypeSchema,
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(20 * 1024 * 1024),
  })
  .strict();
const rejectResponseSchema = z
  .object({ status: z.literal('rejected'), attemptId: z.uuid() })
  .strict();
const failResponseSchema = z
  .object({
    status: z.enum(['retryable_failure', 'terminal_failure']),
    attemptId: z.uuid(),
  })
  .strict();

export interface ControlClientOptions {
  readonly controlOrigin: string;
  readonly controlSecret: string;
  readonly workerId: string;
  readonly fetchImpl?: typeof fetch;
  readonly now?: () => Date;
  readonly uuid?: () => string;
  readonly allowHttp?: boolean;
  readonly requestTimeoutMs?: number;
}

export interface ClaimInput {
  readonly workerId: string;
  readonly signatureTimestamp: string;
  readonly signatureMaxAgeSeconds: number;
}

export class ControlClientError extends Error {
  override readonly name = 'ControlClientError';

  constructor(readonly code: 'control_configuration_invalid' | 'control_response_invalid') {
    super(code);
  }
}

export function sha256Hex(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function canonicalControlRequest(input: {
  readonly workerId: string;
  readonly action: ScannerAction;
  readonly attemptId: string;
  readonly timestamp: number;
  readonly nonce: string;
  readonly bodySha256: string;
}): string {
  if (!scannerActions.includes(input.action))
    throw new ControlClientError('control_configuration_invalid');
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/.test(input.workerId)) {
    throw new ControlClientError('control_configuration_invalid');
  }
  if (input.attemptId !== '-') z.uuid().parse(input.attemptId);
  z.uuid().parse(input.nonce);
  if (!Number.isSafeInteger(input.timestamp) || input.timestamp < 0) {
    throw new ControlClientError('control_configuration_invalid');
  }
  if (!/^[0-9a-f]{64}$/.test(input.bodySha256)) {
    throw new ControlClientError('control_configuration_invalid');
  }
  return [
    SCANNER_CONTROL_VERSION,
    input.workerId,
    'POST',
    SCANNER_CONTROL_PATH,
    input.action,
    input.attemptId,
    String(input.timestamp),
    input.nonce,
    input.bodySha256,
  ].join('\n');
}

export function signControlRequest(canonical: string, secret: string): string {
  try {
    return hmacSha256Hex(secret, canonical);
  } catch {
    throw new ControlClientError('control_configuration_invalid');
  }
}

function parseExactOrigin(value: string): string {
  const parsed = new URL(value);
  if (
    parsed.username ||
    parsed.password ||
    parsed.pathname !== '/' ||
    parsed.search ||
    parsed.hash
  ) {
    throw new ControlClientError('control_configuration_invalid');
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    throw new ControlClientError('control_configuration_invalid');
  }
  return parsed.origin;
}

async function boundedJson(response: Response): Promise<unknown> {
  if (response.status < 200 || response.status >= 300 || response.type === 'opaqueredirect') {
    throw new ControlClientError('control_response_invalid');
  }
  const declared = response.headers.get('content-length');
  if (
    declared &&
    (!/^\d+$/.test(declared) || Number(declared) > MAX_SCANNER_CONTROL_RESPONSE_BYTES)
  ) {
    throw new ControlClientError('control_response_invalid');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new ControlClientError('control_response_invalid');
  const chunks: Uint8Array[] = [];
  let total = 0;
  while (true) {
    const part = await reader.read();
    if (part.done) break;
    total += part.value.byteLength;
    if (total > MAX_SCANNER_CONTROL_RESPONSE_BYTES) {
      await reader.cancel();
      throw new ControlClientError('control_response_invalid');
    }
    chunks.push(part.value);
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    throw new ControlClientError('control_response_invalid');
  }
}

export interface ScannerControlClient {
  claim(input: ClaimInput): Promise<z.infer<typeof claimResponseSchema>>;
  request(
    action: ScannerAction,
    attemptId: string,
    body: Record<string, unknown>,
  ): Promise<unknown>;
  prepareOutput(input: {
    readonly attemptId: string;
    readonly attemptToken: string;
    readonly prepareFingerprint: string;
    readonly inputMime: AcceptedMediaMimeType;
    readonly outputMime: AcceptedMediaMimeType;
    readonly inputSize: number;
    readonly outputSize: number;
    readonly inputSha256: string;
    readonly outputSha256: string;
    readonly sanitizer: string;
    readonly sanitizerVersion: string;
    readonly jobDeadline: string;
  }): Promise<z.infer<typeof prepareResponseSchema>>;
  authorizeReadback(input: {
    readonly attemptId: string;
    readonly attemptToken: string;
    readonly outputSize: number;
    readonly outputSha256: string;
  }): Promise<z.infer<typeof readbackResponseSchema>>;
  complete(input: {
    readonly attemptId: string;
    readonly attemptToken: string;
    readonly manifestFingerprint: string;
    readonly manifest: unknown;
    readonly attestationSignature: string;
  }): Promise<z.infer<typeof completeResponseSchema>>;
  reject(input: {
    readonly attemptId: string;
    readonly attemptToken: string;
    readonly failureCategory: string;
  }): Promise<z.infer<typeof rejectResponseSchema>>;
  fail(input: {
    readonly attemptId: string;
    readonly attemptToken: string;
    readonly failureCategory: string;
  }): Promise<z.infer<typeof failResponseSchema>>;
}

export function createScannerControlClient(options: ControlClientOptions): ScannerControlClient {
  const origin = parseExactOrigin(options.controlOrigin);
  if (new URL(origin).protocol !== 'https:' && options.allowHttp !== true) {
    throw new ControlClientError('control_configuration_invalid');
  }
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? (() => new Date());
  const uuid = options.uuid ?? randomUUID;
  const requestTimeoutMs = options.requestTimeoutMs ?? DEFAULT_SCANNER_CONTROL_TIMEOUT_MS;
  if (
    !Number.isSafeInteger(requestTimeoutMs) ||
    requestTimeoutMs < 100 ||
    requestTimeoutMs > 10_000
  ) {
    throw new ControlClientError('control_configuration_invalid');
  }
  signControlRequest('configuration-probe', options.controlSecret);
  if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/.test(options.workerId)) {
    throw new ControlClientError('control_configuration_invalid');
  }

  const request = async (
    action: ScannerAction,
    attemptId: string,
    body: Record<string, unknown>,
  ): Promise<unknown> => {
    const nonce = uuid();
    z.uuid().parse(nonce);
    const text = JSON.stringify(body);
    if (Buffer.byteLength(text, 'utf8') > 64 * 1024) {
      throw new ControlClientError('control_configuration_invalid');
    }
    const timestamp = Math.floor(now().getTime() / 1_000);
    const bodySha256 = sha256Hex(text);
    const canonical = canonicalControlRequest({
      workerId: options.workerId,
      action,
      attemptId,
      timestamp,
      nonce,
      bodySha256,
    });
    const controller = new AbortController();
    const timer = setTimeout(
      () => controller.abort(new ControlClientError('control_response_invalid')),
      requestTimeoutMs,
    );
    try {
      const response = await fetchImpl(`${origin}${SCANNER_CONTROL_PATH}`, {
        method: 'POST',
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          'content-type': 'application/json',
          'content-length': String(Buffer.byteLength(text, 'utf8')),
          'x-sallah-scanner-action': action,
          'x-sallah-scanner-attempt': attemptId,
          'x-sallah-scanner-worker': options.workerId,
          'x-sallah-scanner-timestamp': String(timestamp),
          'x-sallah-scanner-nonce': nonce,
          'x-sallah-scanner-signature': signControlRequest(canonical, options.controlSecret),
        },
        body: text,
      });
      return await boundedJson(response);
    } catch (error) {
      if (error instanceof ControlClientError) throw error;
      throw new ControlClientError('control_response_invalid');
    } finally {
      clearTimeout(timer);
    }
  };

  const requestWithRecovery = async (
    action: ScannerAction,
    attemptId: string,
    operationId: string,
    payload: () => Record<string, unknown>,
  ): Promise<unknown> => {
    let lastError: unknown;
    for (let tryNumber = 0; tryNumber < 2; tryNumber += 1) {
      try {
        return await request(action, attemptId, {
          operationId,
          nonceOperationId: uuid(),
          ...payload(),
        });
      } catch (error) {
        lastError = error;
      }
    }
    throw lastError;
  };

  return {
    request,
    async claim(input) {
      if (input.workerId !== options.workerId) {
        throw new ControlClientError('control_configuration_invalid');
      }
      const operationId = uuid();
      const result = await requestWithRecovery('claim', '-', operationId, () => ({
        workerId: input.workerId,
        signatureTimestamp: input.signatureTimestamp,
        signatureMaxAgeSeconds: input.signatureMaxAgeSeconds,
      }));
      const parsed = claimResponseSchema.safeParse(result);
      if (!parsed.success) throw new ControlClientError('control_response_invalid');
      return parsed.data;
    },
    async prepareOutput(input) {
      const result = await requestWithRecovery('prepare_output', input.attemptId, uuid(), () => ({
        attemptId: input.attemptId,
        attemptToken: input.attemptToken,
        prepareFingerprint: input.prepareFingerprint,
        inputMime: input.inputMime,
        outputMime: input.outputMime,
        inputSize: input.inputSize,
        outputSize: input.outputSize,
        inputSha256: input.inputSha256,
        outputSha256: input.outputSha256,
        sanitizer: input.sanitizer,
        sanitizerVersion: input.sanitizerVersion,
      }));
      const parsed = prepareResponseSchema.safeParse(result);
      if (!parsed.success || parsed.data.processingDeadline !== input.jobDeadline) {
        throw new ControlClientError('control_response_invalid');
      }
      return parsed.data;
    },
    async authorizeReadback(input) {
      const result = await requestWithRecovery(
        'authorize_readback',
        input.attemptId,
        uuid(),
        () => ({
          ...input,
        }),
      );
      const parsed = readbackResponseSchema.safeParse(result);
      if (!parsed.success) throw new ControlClientError('control_response_invalid');
      return parsed.data;
    },
    async complete(input) {
      const finalizeOperationId = uuid();
      const result = await requestWithRecovery('complete', input.attemptId, uuid(), () => ({
        finalizeOperationId,
        ...input,
      }));
      const parsed = completeResponseSchema.safeParse(result);
      if (!parsed.success) throw new ControlClientError('control_response_invalid');
      return parsed.data;
    },
    async reject(input) {
      const result = await requestWithRecovery('reject', input.attemptId, uuid(), () => ({
        ...input,
      }));
      const parsed = rejectResponseSchema.safeParse(result);
      if (!parsed.success) throw new ControlClientError('control_response_invalid');
      return parsed.data;
    },
    async fail(input) {
      const result = await requestWithRecovery('fail', input.attemptId, uuid(), () => ({
        ...input,
      }));
      const parsed = failResponseSchema.safeParse(result);
      if (!parsed.success) throw new ControlClientError('control_response_invalid');
      return parsed.data;
    },
  };
}
