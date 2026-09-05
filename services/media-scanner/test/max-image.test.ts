import { Transformer } from '@napi-rs/image';
import { describe, expect, it } from 'vitest';

import { MAX_UPLOAD_BYTES } from '../src/contracts.js';
import { sanitizeMedia } from '../src/sanitize.js';

describe('maximum-size accepted static image budget', () => {
  it('processes a real near-20MiB PNG below the immutable 120-second deadline', async () => {
    const width = 2_200;
    const height = 2_200;
    const pixels = new Uint8Array(width * height * 4);
    let state = 0x9e37_79b9;
    for (let index = 0; index < pixels.byteLength; index += 1) {
      state ^= state << 13;
      state ^= state >>> 17;
      state ^= state << 5;
      pixels[index] = state & 0xff;
    }
    const encoded = Uint8Array.from(await Transformer.fromRgbaPixels(pixels, width, height).png());
    expect(encoded.byteLength).toBeGreaterThan(18 * 1024 * 1024);
    expect(encoded.byteLength).toBeLessThanOrEqual(MAX_UPLOAD_BYTES);
    const before = process.memoryUsage().rss;
    let peak = before;
    const sampler = setInterval(() => {
      peak = Math.max(peak, process.memoryUsage().rss);
    }, 5);
    const started = performance.now();
    try {
      const result = await sanitizeMedia({
        bytes: encoded,
        purpose: 'request_media',
        declaredMimeType: 'image/png',
        extension: 'png',
      });
      expect(result.bytes.byteLength).toBeLessThanOrEqual(MAX_UPLOAD_BYTES);
    } finally {
      clearInterval(sampler);
    }
    const duration = performance.now() - started;
    expect(duration).toBeLessThan(120_000);
    expect(peak - before).toBeLessThan(1536 * 1024 * 1024);
  }, 120_000);
});
