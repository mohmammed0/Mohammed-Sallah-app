import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createReadStream } from 'node:fs';
import { open, stat, unlink } from 'node:fs/promises';

export class CapabilityHttpError extends Error {
  override readonly name = 'CapabilityHttpError';

  constructor(
    readonly code:
      | 'capability_http_failed'
      | 'capability_redirect_forbidden'
      | 'capability_size_mismatch'
      | 'signed_capability_invalid',
  ) {
    super(code);
  }
}

export function validateCapabilityUrl(
  value: string,
  expectedOrigin: string,
  expectedPath: string,
  allowHttp: boolean,
): URL {
  try {
    const parsed = new URL(value);
    const origin = new URL(expectedOrigin);
    const queryKeys = [...new Set(parsed.searchParams.keys())].sort();
    const hasDuplicateQueryKey = [...parsed.searchParams.keys()].length !== queryKeys.length;
    const expectedQueryKeys = expectedPath.includes('/storage/v1/s3/')
      ? [
          'X-Amz-Algorithm',
          'X-Amz-Content-Sha256',
          'X-Amz-Credential',
          'X-Amz-Date',
          'X-Amz-Expires',
          'X-Amz-Signature',
          'X-Amz-SignedHeaders',
        ].sort()
      : ['token'];
    if (
      parsed.origin !== origin.origin ||
      origin.pathname !== '/' ||
      origin.search ||
      origin.hash ||
      origin.username ||
      origin.password ||
      parsed.pathname !== expectedPath ||
      parsed.username ||
      parsed.password ||
      parsed.hash ||
      hasDuplicateQueryKey ||
      JSON.stringify(queryKeys) !== JSON.stringify(expectedQueryKeys) ||
      (expectedPath.includes('/storage/v1/s3/') &&
        (parsed.searchParams.get('X-Amz-Content-Sha256') !== 'UNSIGNED-PAYLOAD' ||
          parsed.searchParams.get('X-Amz-SignedHeaders') !== 'content-type;host')) ||
      (parsed.protocol !== 'https:' && !(allowHttp && parsed.protocol === 'http:'))
    ) {
      throw new Error('invalid');
    }
    return parsed;
  } catch {
    throw new CapabilityHttpError('signed_capability_invalid');
  }
}

function assertHttpSuccess(response: Response): void {
  if (response.status >= 300 && response.status < 400) {
    throw new CapabilityHttpError('capability_redirect_forbidden');
  }
  if (response.status < 200 || response.status >= 300 || response.type === 'opaqueredirect') {
    throw new CapabilityHttpError('capability_http_failed');
  }
}

export interface DownloadCapabilityOptions {
  readonly url: string;
  readonly expectedOrigin: string;
  readonly expectedPath: string;
  readonly allowHttp: boolean;
  readonly destinationPath: string;
  readonly expectedSize: number;
  readonly maxBytes: number;
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
}

export interface FileDigest {
  readonly size: number;
  readonly sha256: string;
  readonly storageFingerprint: string;
}

function responseStorageFingerprint(response: Response): string {
  const candidate = response.headers.get('etag')?.trim().replace(/^"|"$/g, '').toLowerCase();
  if (!candidate || !/^[0-9a-f]{32,64}$/.test(candidate)) {
    throw new CapabilityHttpError('capability_http_failed');
  }
  return candidate;
}

export async function downloadCapability(options: DownloadCapabilityOptions): Promise<FileDigest> {
  validateCapabilityUrl(
    options.url,
    options.expectedOrigin,
    options.expectedPath,
    options.allowHttp,
  );
  if (
    !Number.isSafeInteger(options.expectedSize) ||
    !Number.isSafeInteger(options.maxBytes) ||
    options.expectedSize <= 0 ||
    options.expectedSize > options.maxBytes
  ) {
    throw new CapabilityHttpError('capability_size_mismatch');
  }
  const response = await (options.fetchImpl ?? fetch)(options.url, {
    method: 'GET',
    redirect: 'manual',
    ...(options.signal ? { signal: options.signal } : {}),
    headers: { accept: 'application/octet-stream' },
  });
  assertHttpSuccess(response);
  const storageFingerprint = responseStorageFingerprint(response);
  const declared = response.headers.get('content-length');
  if (declared && (!/^\d+$/.test(declared) || Number(declared) !== options.expectedSize)) {
    throw new CapabilityHttpError('capability_size_mismatch');
  }
  const reader = response.body?.getReader();
  if (!reader) throw new CapabilityHttpError('capability_http_failed');
  const output = await open(options.destinationPath, 'wx', 0o600);
  const digest = createHash('sha256');
  let size = 0;
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      size += chunk.value.byteLength;
      if (size > options.maxBytes || size > options.expectedSize) {
        await reader.cancel();
        throw new CapabilityHttpError('capability_size_mismatch');
      }
      digest.update(chunk.value);
      await output.write(chunk.value);
    }
    if (size !== options.expectedSize) {
      throw new CapabilityHttpError('capability_size_mismatch');
    }
    await output.sync();
    return { size, sha256: digest.digest('hex'), storageFingerprint };
  } catch (error) {
    await output.close().catch(() => undefined);
    await unlink(options.destinationPath).catch(() => undefined);
    throw error;
  } finally {
    await output.close().catch(() => undefined);
  }
}

export interface UploadCapabilityOptions {
  readonly url: string;
  readonly expectedOrigin: string;
  readonly expectedPath: string;
  readonly allowHttp: boolean;
  readonly sourcePath: string;
  readonly expectedSize: number;
  readonly expectedSha256: string;
  readonly contentType: 'image/jpeg' | 'image/png' | 'image/webp' | 'audio/mp4' | 'video/mp4';
  readonly fetchImpl?: typeof fetch;
  readonly signal?: AbortSignal;
}

async function hashFile(path: string): Promise<string> {
  const digest = createHash('sha256');
  const stream = createReadStream(path);
  try {
    for await (const chunk of stream as AsyncIterable<Buffer>) digest.update(chunk);
    return digest.digest('hex');
  } finally {
    stream.destroy();
  }
}

export async function uploadCapability(options: UploadCapabilityOptions): Promise<void> {
  validateCapabilityUrl(
    options.url,
    options.expectedOrigin,
    options.expectedPath,
    options.allowHttp,
  );
  const sourceStat = await stat(options.sourcePath);
  if (!sourceStat.isFile() || sourceStat.size !== options.expectedSize) {
    throw new CapabilityHttpError('capability_size_mismatch');
  }
  if (
    !/^[0-9a-f]{64}$/.test(options.expectedSha256) ||
    (await hashFile(options.sourcePath)) !== options.expectedSha256
  ) {
    throw new CapabilityHttpError('capability_size_mismatch');
  }
  const body = createReadStream(options.sourcePath);
  try {
    await once(body, 'open');
    const init: RequestInit & { duplex: 'half' } = {
      method: 'PUT',
      redirect: 'manual',
      duplex: 'half',
      ...(options.signal ? { signal: options.signal } : {}),
      headers: {
        'content-type': options.contentType,
        'content-length': String(options.expectedSize),
      },
      body: body as unknown as BodyInit,
    };
    const response = await (options.fetchImpl ?? fetch)(options.url, init);
    assertHttpSuccess(response);
  } finally {
    const closed = body.closed ? undefined : once(body, 'close').catch(() => undefined);
    body.destroy();
    await closed;
  }
}
