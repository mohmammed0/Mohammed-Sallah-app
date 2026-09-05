import { readFile } from 'node:fs/promises';

import { describe, expect, it, vi } from 'vitest';

import {
  canonicalControlRequest,
  createScannerControlClient,
  sha256Hex,
  signControlRequest,
} from '../src/control-client.js';

const goldenPath = new URL(
  '../../../supabase/functions/_shared/scanner-control-golden.json',
  import.meta.url,
);

describe('scanner-control HMAC client', () => {
  it('matches the checked-in Deno golden vector byte for byte', async () => {
    const golden = JSON.parse(await readFile(goldenPath, 'utf8')) as {
      control: {
        secret: string;
        body: string;
        bodySha256: string;
        canonical: string;
        signature: string;
      };
    };
    const bodySha256 = sha256Hex(golden.control.body);
    const canonical = canonicalControlRequest({
      workerId: 'scanner-worker-1',
      action: 'claim',
      attemptId: '-',
      timestamp: 1_787_313_660,
      nonce: '44444444-4444-4444-8444-444444444444',
      bodySha256,
    });

    expect(bodySha256).toBe(golden.control.bodySha256);
    expect(canonical).toBe(golden.control.canonical);
    expect(signControlRequest(canonical, golden.control.secret)).toBe(golden.control.signature);
  });

  it('sends only bounded JSON to the exact control origin with no broad credential', async () => {
    const fetchImpl = vi.fn<typeof fetch>((_input, init) => {
      const headers = new Headers(init?.headers);
      expect(headers.get('authorization')).toBeNull();
      expect(headers.get('apikey')).toBeNull();
      expect(headers.get('x-sallah-scanner-action')).toBe('claim');
      expect(headers.get('x-sallah-scanner-attempt')).toBe('-');
      expect(headers.get('x-sallah-scanner-worker')).toBe('scanner-worker-1');
      return Promise.resolve(Response.json({ status: 'idle' }));
    });
    const client = createScannerControlClient({
      controlOrigin: 'https://scanner-control.example',
      controlSecret: 'control-secret-that-is-at-least-thirty-two-bytes',
      workerId: 'scanner-worker-1',
      fetchImpl,
      now: () => new Date('2026-08-21T12:00:00.000Z'),
      uuid: (() => {
        const values = [
          '22222222-2222-4222-8222-222222222222',
          '33333333-3333-4333-8333-333333333333',
          '44444444-4444-4444-8444-444444444444',
        ];
        return () => values.shift() ?? '55555555-5555-4555-8555-555555555555';
      })(),
    });

    await expect(
      client.claim({
        workerId: 'scanner-worker-1',
        signatureTimestamp: '2026-08-21T12:00:00.000Z',
        signatureMaxAgeSeconds: 3_600,
      }),
    ).resolves.toEqual({ status: 'idle' });
    expect(fetchImpl).toHaveBeenCalledWith(
      'https://scanner-control.example/functions/v1/scanner-control',
      expect.objectContaining({ method: 'POST', redirect: 'manual' }),
    );
  });

  it('fails closed on redirects, oversized responses, and schema drift', async () => {
    const base = {
      controlOrigin: 'https://scanner-control.example',
      controlSecret: 'control-secret-that-is-at-least-thirty-two-bytes',
      workerId: 'scanner-worker-1',
      now: () => new Date('2026-08-21T12:00:00.000Z'),
    } as const;
    const body = {
      workerId: 'scanner-worker-1',
      signatureTimestamp: '2026-08-21T12:00:00.000Z',
      signatureMaxAgeSeconds: 3_600,
    } as const;
    for (const createResponse of [
      () => new Response(null, { status: 302, headers: { location: 'https://evil.example' } }),
      () => new Response(JSON.stringify({ status: 'idle', extra: 'x' })),
      () => new Response('x'.repeat(65 * 1024)),
    ]) {
      const client = createScannerControlClient({
        ...base,
        fetchImpl: () => Promise.resolve(createResponse()),
      });
      await expect(client.claim(body)).rejects.toThrowError(/control_response_invalid/);
    }
  });

  it('repairs one lost response with a stable domain operation and fresh nonce operation', async () => {
    const bodies: Array<Record<string, unknown>> = [];
    let requestCount = 0;
    const fetchImpl = vi.fn<typeof fetch>((_input, init) => {
      if (typeof init?.body !== 'string') throw new Error('expected_json_body');
      bodies.push(JSON.parse(init.body) as Record<string, unknown>);
      requestCount += 1;
      if (requestCount === 1) return Promise.reject(new TypeError('response_lost'));
      return Promise.resolve(Response.json({ status: 'idle' }));
    });
    let sequence = 0;
    const client = createScannerControlClient({
      controlOrigin: 'https://scanner-control.example',
      controlSecret: 'control-secret-that-is-at-least-thirty-two-bytes',
      workerId: 'scanner-worker-1',
      fetchImpl,
      uuid: () => `${String(++sequence).padStart(8, '0')}-0000-4000-8000-000000000000`,
    });

    await expect(
      client.claim({
        workerId: 'scanner-worker-1',
        signatureTimestamp: '2026-08-22T12:00:00.000Z',
        signatureMaxAgeSeconds: 3_600,
      }),
    ).resolves.toEqual({ status: 'idle' });
    expect(bodies).toHaveLength(2);
    expect(bodies[0]?.operationId).toBe(bodies[1]?.operationId);
    expect(bodies[0]?.nonceOperationId).not.toBe(bodies[1]?.nonceOperationId);
  });

  it('bounds every metadata-only control request with a short abort deadline', async () => {
    let aborts = 0;
    const fetchImpl = vi.fn<typeof fetch>(
      (_input, init) =>
        new Promise<Response>((_resolve, reject) => {
          const signal = init?.signal;
          signal?.addEventListener(
            'abort',
            () => {
              aborts += 1;
              reject(new DOMException('aborted', 'AbortError'));
            },
            { once: true },
          );
        }),
    );
    const client = createScannerControlClient({
      controlOrigin: 'https://scanner-control.example',
      controlSecret: 'control-secret-that-is-at-least-thirty-two-bytes',
      workerId: 'scanner-worker-1',
      fetchImpl,
      requestTimeoutMs: 100,
    });

    await expect(
      client.claim({
        workerId: 'scanner-worker-1',
        signatureTimestamp: '2026-08-22T12:00:00.000Z',
        signatureMaxAgeSeconds: 3_600,
      }),
    ).rejects.toBeInstanceOf(Error);
    expect(aborts).toBe(2);
  }, 1_000);

  it.each(['claim', 'prepare_output', 'authorize_readback'] as const)(
    'rejects a non-opaque %s object reference before capability transfer',
    async (action) => {
      const contextualRef = 'aa/bb/customer-context-00000000-0000-4000-8000-000000000000';
      const validAttempt = '11111111-1111-4111-8111-111111111111';
      const validToken = '22222222-2222-4222-8222-222222222222';
      const fetchImpl = vi.fn<typeof fetch>(() => {
        if (action === 'claim') {
          return Promise.resolve(
            Response.json({
              status: 'claimed',
              attemptId: validAttempt,
              attemptToken: validToken,
              attemptOrdinal: 1,
              processingDeadline: '2026-08-22T12:02:00.000Z',
              purpose: 'request_media',
              declaredMimeType: 'image/png',
              sizeBytes: 68,
              maxSizeBytes: 20 * 1024 * 1024,
              inputRef: contextualRef,
              inputUrl: `https://storage.example/storage/v1/object/sign/scan-input/${contextualRef}?token=x`,
            }),
          );
        }
        if (action === 'prepare_output') {
          return Promise.resolve(
            Response.json({
              status: 'output_prepared',
              attemptId: validAttempt,
              outputRef: contextualRef,
              uploadUrl: `https://storage.example/storage/v1/object/upload/sign/scan-output/${contextualRef}?token=x`,
              upsert: false,
              processingDeadline: '2026-08-22T12:02:00.000Z',
            }),
          );
        }
        return Promise.resolve(
          Response.json({
            status: 'readback_authorized',
            attemptId: validAttempt,
            outputRef: contextualRef,
            readUrl: `https://storage.example/storage/v1/object/sign/scan-output/${contextualRef}?token=x`,
          }),
        );
      });
      const client = createScannerControlClient({
        controlOrigin: 'https://scanner-control.example',
        controlSecret: 'control-secret-that-is-at-least-thirty-two-bytes',
        workerId: 'scanner-worker-1',
        fetchImpl,
      });

      const operation =
        action === 'claim'
          ? client.claim({
              workerId: 'scanner-worker-1',
              signatureTimestamp: '2026-08-22T12:00:00.000Z',
              signatureMaxAgeSeconds: 3_600,
            })
          : action === 'prepare_output'
            ? client.prepareOutput({
                attemptId: validAttempt,
                attemptToken: validToken,
                prepareFingerprint: 'a'.repeat(64),
                inputMime: 'image/png',
                outputMime: 'image/png',
                inputSize: 68,
                outputSize: 68,
                inputSha256: 'b'.repeat(64),
                outputSha256: 'c'.repeat(64),
                sanitizer: 'decode-reencode-png-v1',
                sanitizerVersion: '1.0.0',
                jobDeadline: '2026-08-22T12:02:00.000Z',
              })
            : client.authorizeReadback({
                attemptId: validAttempt,
                attemptToken: validToken,
                outputSize: 68,
                outputSha256: 'c'.repeat(64),
              });

      await expect(operation).rejects.toThrowError('control_response_invalid');
    },
  );
});
