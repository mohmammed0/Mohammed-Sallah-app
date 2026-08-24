import { readFile } from 'node:fs/promises';

import { describe, expect, it } from 'vitest';

import {
  canonicalAttestation,
  fingerprintAttestation,
  parseAttestation,
  signAttestation,
} from '../src/manifest.js';

const goldenPath = new URL(
  '../../../supabase/functions/_shared/scanner-control-golden.json',
  import.meta.url,
);

describe('canonical scanner attestation', () => {
  it('matches the Deno golden canonical bytes, fingerprint, and HMAC', async () => {
    const golden = JSON.parse(await readFile(goldenPath, 'utf8')) as {
      attestation: {
        secret: string;
        manifest: unknown;
        canonical: string;
        fingerprint: string;
        signature: string;
      };
    };
    const manifest = parseAttestation(golden.attestation.manifest);

    expect(canonicalAttestation(manifest)).toBe(golden.attestation.canonical);
    expect(fingerprintAttestation(manifest)).toBe(golden.attestation.fingerprint);
    expect(signAttestation(manifest, golden.attestation.secret)).toBe(golden.attestation.signature);
  });

  it('rejects missing, extra, reordered-input-independent, stale-shape, and unbounded fields', () => {
    const base = {
      schemaVersion: 'sallah-media-attestation-v1',
      attemptId: '11111111-1111-4111-8111-111111111111',
      inputRef: 'aa/bb/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
      outputRef: 'cc/dd/cccccccc-cccc-4ccc-8ccc-cccccccccccc',
      purpose: 'request_media',
      detectedInputMime: 'image/png',
      detectedOutputMime: 'image/png',
      inputSize: 1,
      outputSize: 1,
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
      signatureAgeSeconds: 0,
      processingDurationMs: 1,
      jobDeadline: '2026-08-21T12:02:00.000Z',
      nonce: '66666666-6666-4666-8666-666666666666',
      correlationId: '77777777-7777-4777-8777-777777777777',
      readbackSha256: '2'.repeat(64),
      storageFingerprint: 'a'.repeat(32),
    } as const;

    expect(() => parseAttestation({ ...base, extra: 'forbidden' })).toThrowError(
      'invalid_attestation',
    );
    const missing = Object.fromEntries(Object.entries(base).filter(([key]) => key !== 'outputRef'));
    expect(() => parseAttestation(missing)).toThrowError('invalid_attestation');
    expect(() => parseAttestation({ ...base, outputSize: 20 * 1024 * 1024 + 1 })).toThrowError(
      'invalid_attestation',
    );
    expect(() =>
      parseAttestation({
        ...base,
        purpose: 'completion_proof',
        detectedInputMime: 'video/mp4',
        detectedOutputMime: 'video/mp4',
        sanitizer: 'sallah.ffmpeg.remux.video-mp4',
      }),
    ).not.toThrow();
    expect(() =>
      parseAttestation({
        ...base,
        purpose: 'request_audio',
        detectedInputMime: 'audio/mp4',
        detectedOutputMime: 'audio/mp4',
        sanitizer: 'sallah.ffmpeg.remux.audio-mp4',
      }),
    ).not.toThrow();
  });
});
