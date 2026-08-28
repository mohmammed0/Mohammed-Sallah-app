import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  downloadCapability,
  uploadCapability,
  validateCapabilityUrl,
} from '../src/capability-http.js';

const temporary: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporary.splice(0).map(async (path) => rm(path, { recursive: true, force: true })),
  );
});

describe('exact signed Storage capabilities', () => {
  it('allows only the configured exact origin/path/query and rejects the full SSRF matrix', () => {
    const expectedPath =
      '/storage/v1/object/sign/scan-input/aa/bb/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    expect(
      validateCapabilityUrl(
        `https://storage.example${expectedPath}?token=signed`,
        'https://storage.example',
        expectedPath,
        false,
      ).pathname,
    ).toBe(expectedPath);
    for (const value of [
      `https://evil.example${expectedPath}?token=signed`,
      `https://storage.example.evil.test${expectedPath}?token=signed`,
      `https://%65vil.example${expectedPath}?token=signed`,
      `https://user@storage.example${expectedPath}?token=signed`,
      `https://storage.example${expectedPath}/other?token=signed`,
      `https://storage.example/storage/v1/object/sign/scan-input/aa/bb/%2e%2e%2fobject?token=signed`,
      `https://storage.example${expectedPath}?token=signed#fragment`,
      `http://storage.example${expectedPath}?token=signed`,
      `ftp://storage.example${expectedPath}?token=signed`,
      `https://storage.example:444${expectedPath}?token=signed`,
      `https://127.0.0.1${expectedPath}?token=signed`,
      `https://[::1]${expectedPath}?token=signed`,
      `https://10.0.0.1${expectedPath}?token=signed`,
      `https://storage.example${expectedPath}?token=signed&next=https%3A%2F%2Fevil.example`,
      `https://storage.example${expectedPath}?token=signed&token=other`,
    ]) {
      expect(() =>
        validateCapabilityUrl(value, 'https://storage.example', expectedPath, false),
      ).toThrowError('signed_capability_invalid');
    }
    expect(() =>
      validateCapabilityUrl(
        `https://storage.example${expectedPath}?token=signed`,
        'https://operator:secret@storage.example',
        expectedPath,
        false,
      ),
    ).toThrowError('signed_capability_invalid');
  });

  it('streams an exact bounded download to disk while hashing without a full-media copy', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sallah-capability-'));
    temporary.push(directory);
    const destinationPath = join(directory, 'input.bin');
    const chunks = [Uint8Array.of(1, 2), Uint8Array.of(3, 4, 5)];
    const fetchImpl = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(
          new ReadableStream({
            pull(controller) {
              const chunk = chunks.shift();
              if (chunk) controller.enqueue(chunk);
              else controller.close();
            },
          }),
          {
            status: 200,
            headers: {
              'content-length': '5',
              etag: '"7cfdd07889b3295d6a550914ab35e068"',
            },
          },
        ),
      ),
    );

    const result = await downloadCapability({
      url: 'https://storage.example/storage/v1/object/sign/scan-input/aa/bb/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?token=x',
      expectedOrigin: 'https://storage.example',
      expectedPath: '/storage/v1/object/sign/scan-input/aa/bb/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      allowHttp: false,
      destinationPath,
      expectedSize: 5,
      maxBytes: 20 * 1024 * 1024,
      fetchImpl,
    });

    expect(result).toEqual({
      size: 5,
      sha256: '74f81fe167d99b4cb41d6d0ccda82278caee9f3e2f25d5e5a3936ff3dcec60d0',
      storageFingerprint: '7cfdd07889b3295d6a550914ab35e068',
    });
    expect([...(await readFile(destinationPath))]).toEqual([1, 2, 3, 4, 5]);
  });

  it('rejects single-hop and multi-hop redirect responses, length mismatch, and overflow', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'sallah-capability-'));
    temporary.push(directory);
    const destinationPath = join(directory, 'input.bin');
    const base = {
      url: 'https://storage.example/storage/v1/object/sign/scan-input/aa/bb/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?token=x',
      expectedOrigin: 'https://storage.example',
      expectedPath: '/storage/v1/object/sign/scan-input/aa/bb/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      allowHttp: false,
      destinationPath,
      expectedSize: 1,
      maxBytes: 1,
    } as const;
    await expect(
      downloadCapability({
        ...base,
        fetchImpl: () => Promise.resolve(new Response(null, { status: 302 })),
      }),
    ).rejects.toThrowError('capability_redirect_forbidden');
    const multiHop = vi.fn<typeof fetch>(() =>
      Promise.resolve(
        new Response(null, { status: 301, headers: { location: 'https://evil.example' } }),
      ),
    );
    await expect(downloadCapability({ ...base, fetchImpl: multiHop })).rejects.toThrowError(
      'capability_redirect_forbidden',
    );
    expect(multiHop).toHaveBeenCalledTimes(1);
    await expect(
      downloadCapability({
        ...base,
        fetchImpl: () =>
          Promise.resolve(
            new Response(Uint8Array.of(1, 2), {
              status: 200,
              headers: { etag: '"7cfdd07889b3295d6a550914ab35e068"' },
            }),
          ),
      }),
    ).rejects.toThrowError('capability_size_mismatch');

    const source = join(directory, 'output.bin');
    await writeFile(source, Uint8Array.of(1));
    const s3Query = new URLSearchParams({
      'X-Amz-Algorithm': 'AWS4-HMAC-SHA256',
      'X-Amz-Content-Sha256': 'UNSIGNED-PAYLOAD',
      'X-Amz-Credential': 'access/20260824/local/s3/aws4_request',
      'X-Amz-Date': '20260824T120000Z',
      'X-Amz-Expires': '45',
      'X-Amz-Signature': 'a'.repeat(64),
      'X-Amz-SignedHeaders': 'content-type;host',
    });
    await expect(
      uploadCapability({
        url: `https://storage.example/storage/v1/s3/scan-output/aa/bb/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa?${s3Query}`,
        expectedOrigin: 'https://storage.example',
        expectedPath: '/storage/v1/s3/scan-output/aa/bb/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        allowHttp: false,
        sourcePath: source,
        expectedSize: 1,
        expectedSha256: '4bf5122f344554c53bde2ebb8cd2b7e3d1600ad631c385a5d7cce23c7785459a',
        contentType: 'image/png',
        fetchImpl: (_url, init) => {
          expect((init?.body as unknown as { pending: boolean }).pending).toBe(false);
          return Promise.resolve(new Response(null, { status: 307 }));
        },
      }),
    ).rejects.toThrowError('capability_redirect_forbidden');

    await rm(directory, { recursive: true, force: true });
    temporary.splice(temporary.indexOf(directory), 1);
    await new Promise<void>((resolve) => setImmediate(resolve));
  });
});
