import { once } from 'node:events';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { createServer, type Server, type Socket } from 'node:net';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it } from 'vitest';

import { ClamdClient } from '../src/clamd.js';

const servers = new Set<Server>();
const sockets = new Set<Socket>();
const temporary: string[] = [];

afterEach(async () => {
  for (const socket of sockets) socket.destroy();
  await Promise.all(
    [...servers].map(
      async (server) => await new Promise<void>((resolve) => server.close(() => resolve())),
    ),
  );
  servers.clear();
  sockets.clear();
  await Promise.all(
    temporary.splice(0).map(async (path) => rm(path, { recursive: true, force: true })),
  );
});

function completeInstream(bytes: Buffer): boolean {
  if (!bytes.subarray(0, 10).equals(Buffer.from('zINSTREAM\0'))) return false;
  let offset = 10;
  while (offset + 4 <= bytes.length) {
    const size = bytes.readUInt32BE(offset);
    offset += 4;
    if (size === 0) return offset === bytes.length;
    if (offset + size > bytes.length) return false;
    offset += size;
  }
  return false;
}

async function fixture(
  scanResponse: string,
  versionResponses = ['ClamAV 1.4.3/28000/Sat Aug 22 12:00:00 2026'],
): Promise<{ port: number; requests: Buffer[] }> {
  const requests: Buffer[] = [];
  let versionIndex = 0;
  const server = createServer((socket) => {
    sockets.add(socket);
    const index = requests.length;
    requests.push(Buffer.alloc(0));
    socket.on('data', (chunk: Buffer) => {
      requests[index] = Buffer.concat([requests[index] ?? Buffer.alloc(0), chunk]);
      const request = requests[index] ?? Buffer.alloc(0);
      if (completeInstream(request)) socket.end(`${scanResponse}\0`);
      else if (request.equals(Buffer.from('zVERSION\0'))) {
        const response = versionResponses[Math.min(versionIndex, versionResponses.length - 1)];
        versionIndex += 1;
        socket.end(`${response ?? 'RELOADING'}\0`);
      }
    });
  });
  servers.add(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('fixture_failed');
  return { port: address.port, requests };
}

async function adversarialFixture(
  onScan: (socket: Socket) => void,
): Promise<{ port: number; requests: Buffer[] }> {
  const requests: Buffer[] = [];
  const handled = new WeakSet<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    const index = requests.length;
    requests.push(Buffer.alloc(0));
    socket.on('data', (chunk: Buffer) => {
      requests[index] = Buffer.concat([requests[index] ?? Buffer.alloc(0), chunk]);
      const request = requests[index] ?? Buffer.alloc(0);
      if (handled.has(socket)) return;
      if (request.equals(Buffer.from('zVERSION\0'))) {
        handled.add(socket);
        socket.end('ClamAV 1.4.3/28000/Sat Aug 22 12:00:00 2026\0');
      } else if (completeInstream(request)) {
        handled.add(socket);
        onScan(socket);
      }
    });
  });
  servers.add(server);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('fixture_failed');
  return { port: address.port, requests };
}

async function input(bytes: Uint8Array): Promise<string> {
  const directory = await mkdtemp(join(tmpdir(), 'sallah-clamd-'));
  temporary.push(directory);
  const path = join(directory, 'input');
  await writeFile(path, bytes);
  return path;
}

function client(port: number): ClamdClient {
  return new ClamdClient({
    host: '127.0.0.1',
    port,
    maxBytes: 20 * 1024 * 1024,
    chunkBytes: 4,
    connectTimeoutMs: 250,
    responseTimeoutMs: 250,
    signatureMaxAgeSeconds: 3_600,
    now: () => new Date('2026-08-22T13:00:00.000Z'),
  });
}

describe('ClamD file streaming', () => {
  it('streams bounded big-endian INSTREAM frames and retrieves fresh version evidence separately', async () => {
    const server = await fixture('stream: OK');
    await expect(
      client(server.port).scanFile(await input(Uint8Array.from([1, 2, 3, 4, 5]))),
    ).resolves.toMatchObject({
      verdict: 'clean',
      engineVersion: '1.4.3',
      signatureVersion: '28000',
      signatureTimestamp: '2026-08-22T12:00:00.000Z',
      signatureAgeSeconds: 3_600,
    });
    expect(server.requests).toHaveLength(3);
    expect(server.requests[0]).toEqual(Buffer.from('zVERSION\0'));
    expect(server.requests[1]?.subarray(0, 10)).toEqual(Buffer.from('zINSTREAM\0'));
    expect(server.requests[1]?.subarray(-4)).toEqual(Buffer.alloc(4));
    expect(server.requests[2]).toEqual(Buffer.from('zVERSION\0'));
  });

  it('preserves a bounded malicious verdict without returning media', async () => {
    const server = await fixture('stream: Eicar-Signature FOUND');
    await expect(
      client(server.port).scanFile(await input(Uint8Array.of(1))),
    ).resolves.toMatchObject({
      verdict: 'malicious',
      detectedSignature: 'Eicar-Signature',
    });
  });

  it('rejects a file above its bound before opening a daemon connection', async () => {
    const server = await fixture('stream: OK');
    const scanner = new ClamdClient({
      host: '127.0.0.1',
      port: server.port,
      maxBytes: 1,
      connectTimeoutMs: 250,
      responseTimeoutMs: 250,
      signatureMaxAgeSeconds: 3_600,
    });
    await expect(scanner.scanFile(await input(Uint8Array.of(1, 2)))).rejects.toMatchObject({
      code: 'size_limit_exceeded',
    });
    expect(server.requests).toHaveLength(0);
  });

  it('fails closed when the signature database changes around an INSTREAM scan', async () => {
    const server = await fixture('stream: OK', [
      'ClamAV 1.4.3/27999/Sat Aug 22 12:00:00 2026',
      'ClamAV 1.4.3/28000/Sat Aug 22 12:00:00 2026',
    ]);

    await expect(client(server.port).scanFile(await input(Uint8Array.of(1)))).rejects.toMatchObject(
      {
        code: 'signature_reload',
      },
    );
  });

  it.each([
    ['newline-only reply', (socket: Socket) => socket.end('stream: OK\n')],
    ['unknown reply', (socket: Socket) => socket.end('stream: MAYBE\0')],
    ['oversized reply', (socket: Socket) => socket.end(`${'A'.repeat(4_097)}\0`)],
  ] as const)('rejects a malformed %s without exposing daemon bytes', async (_label, respond) => {
    const server = await adversarialFixture(respond);
    const result = client(server.port).scanFile(await input(Uint8Array.of(1)));
    await expect(result).rejects.toMatchObject({ code: 'protocol_error' });
    await expect(result).rejects.not.toThrow(/MAYBE|AAAA|stream: OK/u);
  });

  it('rejects a delayed second NUL record after an otherwise complete response', async () => {
    const server = await adversarialFixture((socket) => {
      socket.write('stream: OK\0');
      setTimeout(() => socket.end('extra\0'), 10);
    });
    await expect(client(server.port).scanFile(await input(Uint8Array.of(1)))).rejects.toMatchObject(
      { code: 'protocol_error' },
    );
  });

  it('redacts raw daemon errors, paths, and content from the adapter error', async () => {
    const server = await adversarialFixture((socket) => {
      socket.end('stream: /private/tenant/input.png secret-content ERROR\0');
    });
    const result = client(server.port).scanFile(await input(Uint8Array.of(1)));
    await expect(result).rejects.toMatchObject({ code: 'scan_failed', message: 'scan_failed' });
    await expect(result).rejects.not.toThrow(/private|tenant|secret-content/u);
  });

  it('times out a stalled daemon response and closes the socket', async () => {
    const server = await adversarialFixture(() => undefined);
    await expect(client(server.port).scanFile(await input(Uint8Array.of(1)))).rejects.toMatchObject(
      { code: 'response_timeout' },
    );
  });

  it('honors caller cancellation while the daemon is stalled', async () => {
    const server = await adversarialFixture(() => undefined);
    const controller = new AbortController();
    const result = client(server.port).scanFile(await input(Uint8Array.of(1)), controller.signal);
    setTimeout(() => controller.abort(), 25);
    await expect(result).rejects.toMatchObject({ code: 'aborted' });
  });

  it('redacts refused-socket details as a bounded connection category', async () => {
    const server = createServer();
    server.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const address = server.address();
    if (address === null || typeof address === 'string') throw new Error('fixture_failed');
    const port = address.port;
    await new Promise<void>((resolve) => server.close(() => resolve()));
    const result = client(port).scanFile(await input(Uint8Array.of(1)));
    await expect(result).rejects.toMatchObject({ code: 'connection_failed' });
    await expect(result).rejects.not.toThrow(/ECONNREFUSED|127\.0\.0\.1/u);
  });
});
