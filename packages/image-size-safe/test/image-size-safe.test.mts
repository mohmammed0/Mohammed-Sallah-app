import { createRequire } from 'node:module';
import { describe, expect, it } from 'vitest';

interface Dimensions {
  width: number;
  height: number;
  type: string;
}
const require = createRequire(import.meta.url);
const imageSize = require('../index.cjs') as (input: Uint8Array) => Dimensions;

describe('bounded image dimensions', () => {
  it('reads PNG dimensions', () => {
    const bytes = new Uint8Array(24);
    bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    bytes.set([0x49, 0x48, 0x44, 0x52], 12);
    new DataView(bytes.buffer).setUint32(16, 640);
    new DataView(bytes.buffer).setUint32(20, 480);
    expect(imageSize(bytes)).toEqual({ width: 640, height: 480, type: 'png' });
  });

  it('uses a bounded JPEG segment walk', () => {
    const bytes = Uint8Array.from([
      0xff, 0xd8, 0xff, 0xc0, 0x00, 0x11, 0x08, 0x01, 0x2c, 0x02, 0x58, 0x03, 0x01, 0x11, 0x00,
      0x02, 0x11, 0x00, 0x03, 0x11, 0x00,
    ]);
    expect(imageSize(bytes)).toEqual({ width: 600, height: 300, type: 'jpg' });
  });

  it.each([
    ['ICNS zero-length entry', Uint8Array.from([0x69, 0x63, 0x6e, 0x73, 0, 0, 0, 8, 0, 0, 0, 0])],
    ['JXL zero-size box', Uint8Array.from([0, 0, 0, 0, 0x4a, 0x58, 0x4c, 0x20])],
    ['HEIF zero-size box', Uint8Array.from([0, 0, 0, 0, 0x66, 0x74, 0x79, 0x70])],
  ])('rejects %s without parsing an unbounded box loop', (_name, bytes) => {
    expect(() => imageSize(bytes)).toThrow(/Unsupported image type/u);
  });

  it('rejects oversized in-memory inputs before parsing', () => {
    expect(() => imageSize(new Uint8Array(1024 * 1024 + 1))).toThrow(/1 MiB/u);
  });
});
