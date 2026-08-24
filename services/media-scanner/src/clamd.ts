import { once } from 'node:events';
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createConnection, type NetConnectOpts, type Socket } from 'node:net';

const INSTREAM_COMMAND = Buffer.from('zINSTREAM\0');
const VERSION_COMMAND = Buffer.from('zVERSION\0');
const RESPONSE_LIMIT_BYTES = 4_096;
const MAX_CHUNK_BYTES = 1024 * 1024;

export type ClamdErrorCode =
  | 'aborted'
  | 'connect_timeout'
  | 'connection_failed'
  | 'invalid_configuration'
  | 'protocol_error'
  | 'response_timeout'
  | 'scan_failed'
  | 'signature_future'
  | 'signature_reload'
  | 'signature_stale'
  | 'signature_unparseable'
  | 'size_limit_exceeded';

export class ClamdClientError extends Error {
  override readonly name = 'ClamdClientError';

  constructor(readonly code: ClamdErrorCode) {
    super(code);
  }
}

export interface ClamdVersionEvidence {
  readonly engineVersion: string;
  readonly signatureVersion: string;
  readonly signatureTimestamp: string;
  readonly signatureAgeSeconds: number;
}

export type ClamdScanResult =
  | ({ readonly verdict: 'clean' } & ClamdVersionEvidence)
  | ({ readonly verdict: 'malicious'; readonly detectedSignature: string } & ClamdVersionEvidence);

export type ClamdSocketFactory = (options: NetConnectOpts) => Socket;

export interface ClamdClientOptions {
  readonly host: string;
  readonly port: number;
  readonly maxBytes: number;
  readonly chunkBytes?: number;
  readonly connectTimeoutMs: number;
  readonly responseTimeoutMs: number;
  readonly signatureMaxAgeSeconds: number;
  readonly now?: () => Date;
  readonly socketFactory?: ClamdSocketFactory;
}

function fail(code: ClamdErrorCode): ClamdClientError {
  return new ClamdClientError(code);
}

const monthIndex: Readonly<Record<string, number>> = {
  Jan: 0,
  Feb: 1,
  Mar: 2,
  Apr: 3,
  May: 4,
  Jun: 5,
  Jul: 6,
  Aug: 7,
  Sep: 8,
  Oct: 9,
  Nov: 10,
  Dec: 11,
};

export function parseClamdVersionEvidence(
  response: string,
  at: Date,
  maxAgeSeconds: number,
): ClamdVersionEvidence {
  if (!Number.isSafeInteger(maxAgeSeconds) || maxAgeSeconds < 60 || maxAgeSeconds > 604_800) {
    throw fail('invalid_configuration');
  }
  const match =
    /^ClamAV ([A-Za-z0-9][A-Za-z0-9._+-]{0,63})\/([0-9]{1,20})\/[A-Za-z]{3} ([A-Z][a-z]{2}) ([ 0-9][0-9]) ([0-9]{2}):([0-9]{2}):([0-9]{2}) ([0-9]{4})$/.exec(
      response,
    );
  const month = match?.[3] ? monthIndex[match[3]] : undefined;
  if (!match?.[1] || !match[2] || month === undefined) throw fail('signature_unparseable');
  const day = Number(match[4]);
  const hour = Number(match[5]);
  const minute = Number(match[6]);
  const second = Number(match[7]);
  const year = Number(match[8]);
  const timestampMs = Date.UTC(year, month, day, hour, minute, second);
  const parsed = new Date(timestampMs);
  if (
    !Number.isFinite(timestampMs) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() !== month ||
    parsed.getUTCDate() !== day ||
    parsed.getUTCHours() !== hour ||
    parsed.getUTCMinutes() !== minute ||
    parsed.getUTCSeconds() !== second
  )
    throw fail('signature_unparseable');
  const age = Math.floor((at.getTime() - timestampMs) / 1_000);
  if (age < 0) throw fail('signature_future');
  if (age > maxAgeSeconds) throw fail('signature_stale');
  return {
    engineVersion: match[1],
    signatureVersion: match[2],
    signatureTimestamp: parsed.toISOString(),
    signatureAgeSeconds: age,
  };
}

function validateOptions(options: ClamdClientOptions): void {
  const chunk = options.chunkBytes ?? 64 * 1024;
  if (
    options.host.length === 0 ||
    options.host.length > 253 ||
    !Number.isSafeInteger(options.port) ||
    options.port <= 0 ||
    options.port > 65_535 ||
    !Number.isSafeInteger(options.maxBytes) ||
    options.maxBytes <= 0 ||
    !Number.isSafeInteger(chunk) ||
    chunk <= 0 ||
    chunk > MAX_CHUNK_BYTES ||
    !Number.isSafeInteger(options.connectTimeoutMs) ||
    options.connectTimeoutMs <= 0 ||
    !Number.isSafeInteger(options.responseTimeoutMs) ||
    options.responseTimeoutMs <= 0 ||
    !Number.isSafeInteger(options.signatureMaxAgeSeconds) ||
    options.signatureMaxAgeSeconds < 60 ||
    options.signatureMaxAgeSeconds > 604_800
  )
    throw fail('invalid_configuration');
}

function parseScanResponse(
  response: string,
):
  | { readonly verdict: 'clean' }
  | { readonly verdict: 'malicious'; readonly detectedSignature: string } {
  if (response === 'stream: OK') return { verdict: 'clean' };
  const found = /^stream: ([A-Za-z0-9][A-Za-z0-9._:+-]{0,119}) FOUND$/.exec(response);
  if (found?.[1]) return { verdict: 'malicious', detectedSignature: found[1] };
  if (response === 'INSTREAM size limit exceeded. ERROR') throw fail('size_limit_exceeded');
  if (/^stream: .{1,256} ERROR$/.test(response)) throw fail('scan_failed');
  throw fail('protocol_error');
}

export class ClamdClient {
  readonly #options: ClamdClientOptions;
  readonly #socketFactory: ClamdSocketFactory;

  constructor(options: ClamdClientOptions) {
    validateOptions(options);
    this.#options = options;
    this.#socketFactory = options.socketFactory ?? createConnection;
  }

  async readiness(signal?: AbortSignal): Promise<ClamdVersionEvidence> {
    const response = await this.#exchange((socket) => {
      socket.write(VERSION_COMMAND);
      return Promise.resolve();
    }, signal);
    return parseClamdVersionEvidence(
      response,
      this.#options.now?.() ?? new Date(),
      this.#options.signatureMaxAgeSeconds,
    );
  }

  async scanFile(path: string, signal?: AbortSignal): Promise<ClamdScanResult> {
    if (signal?.aborted) throw fail('aborted');
    const details = await stat(path);
    if (!details.isFile() || details.size <= 0 || details.size > this.#options.maxBytes) {
      throw fail('size_limit_exceeded');
    }
    const before = await this.readiness(signal);
    const verdict = parseScanResponse(
      await this.#exchange(async (socket) => {
        socket.write(INSTREAM_COMMAND);
        const stream = createReadStream(path, {
          highWaterMark: this.#options.chunkBytes ?? 64 * 1024,
        });
        const onAbort = (): void => {
          stream.destroy(fail('aborted'));
        };
        signal?.addEventListener('abort', onAbort, { once: true });
        try {
          for await (const value of stream) {
            if (signal?.aborted) throw fail('aborted');
            const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value);
            const frame = Buffer.allocUnsafe(4);
            frame.writeUInt32BE(chunk.byteLength);
            if (!socket.write(frame)) await once(socket, 'drain');
            if (!socket.write(chunk)) await once(socket, 'drain');
          }
          socket.write(Buffer.alloc(4));
        } finally {
          signal?.removeEventListener('abort', onAbort);
          stream.destroy();
        }
      }, signal),
    );
    const after = await this.readiness(signal);
    if (
      before.engineVersion !== after.engineVersion ||
      before.signatureVersion !== after.signatureVersion ||
      before.signatureTimestamp !== after.signatureTimestamp
    ) {
      throw fail('signature_reload');
    }
    return { ...verdict, ...after };
  }

  async #exchange(
    writePayload: (socket: Socket) => Promise<void>,
    signal?: AbortSignal,
  ): Promise<string> {
    if (signal?.aborted) throw fail('aborted');
    return await new Promise<string>((resolve, reject) => {
      let socket: Socket;
      let settled = false;
      let connected = false;
      let responseTimer: NodeJS.Timeout | undefined;
      const chunks: Buffer[] = [];
      let bytes = 0;
      let complete: string | undefined;

      const settle = (error?: ClamdClientError, value?: string): void => {
        if (settled) return;
        settled = true;
        if (connectTimer) clearTimeout(connectTimer);
        if (responseTimer) clearTimeout(responseTimer);
        signal?.removeEventListener('abort', onAbort);
        socket.destroy();
        if (error) reject(error);
        else resolve(value ?? '');
      };
      const onAbort = (): void => settle(fail('aborted'));
      try {
        socket = this.#socketFactory({ host: this.#options.host, port: this.#options.port });
      } catch {
        reject(fail('connection_failed'));
        return;
      }
      socket.once('connect', () => {
        connected = true;
        if (connectTimer) clearTimeout(connectTimer);
        responseTimer = setTimeout(
          () => settle(fail('response_timeout')),
          this.#options.responseTimeoutMs,
        );
        void writePayload(socket).catch((error: unknown) => {
          settle(error instanceof ClamdClientError ? error : fail('connection_failed'));
        });
      });
      socket.on('data', (chunk: Buffer) => {
        bytes += chunk.byteLength;
        if (bytes > RESPONSE_LIMIT_BYTES || complete !== undefined) {
          settle(fail('protocol_error'));
          return;
        }
        chunks.push(chunk);
        const joined = Buffer.concat(chunks, bytes);
        const nul = joined.indexOf(0);
        if (nul === -1) return;
        if (nul === 0 || nul !== joined.byteLength - 1) {
          settle(fail('protocol_error'));
          return;
        }
        complete = joined.subarray(0, nul).toString('utf8');
      });
      socket.once('end', () =>
        complete === undefined ? settle(fail('protocol_error')) : settle(undefined, complete),
      );
      socket.once('error', () => settle(fail('connection_failed')));
      socket.once('close', () => {
        if (!settled) settle(fail(connected ? 'protocol_error' : 'connection_failed'));
      });
      const connectTimer = setTimeout(
        () => settle(fail('connect_timeout')),
        this.#options.connectTimeoutMs,
      );
      signal?.addEventListener('abort', onAbort, { once: true });
      if (signal?.aborted) onAbort();
    });
  }
}
