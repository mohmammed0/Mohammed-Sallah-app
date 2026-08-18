// @ts-check
/* global module, require */
/* eslint-disable @typescript-eslint/no-require-imports -- Metro consumes this package through CommonJS. */
'use strict';

const { openSync, closeSync, fstatSync, readSync } = require('node:fs');

const MAX_INPUT_BYTES = 1024 * 1024;
const MAX_DIMENSION = 100_000;
const MAX_JPEG_SEGMENTS = 4096;
const MAX_TIFF_ENTRIES = 1024;

/** @param {Uint8Array} bytes @param {number} offset @param {number} length */
function requireRange(bytes, offset, length) {
  if (!Number.isInteger(offset) || offset < 0 || length < 0 || offset + length > bytes.length) {
    throw new TypeError('Truncated or malformed image');
  }
}

/** @param {Uint8Array} bytes @param {number} offset */
function u16be(bytes, offset) {
  requireRange(bytes, offset, 2);
  return ((bytes[offset] ?? 0) << 8) | (bytes[offset + 1] ?? 0);
}

/** @param {Uint8Array} bytes @param {number} offset */
function u16le(bytes, offset) {
  requireRange(bytes, offset, 2);
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8);
}

/** @param {Uint8Array} bytes @param {number} offset */
function u24le(bytes, offset) {
  requireRange(bytes, offset, 3);
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16);
}

/** @param {Uint8Array} bytes @param {number} offset */
function u32be(bytes, offset) {
  requireRange(bytes, offset, 4);
  return (
    (bytes[offset] ?? 0) * 0x1000000 +
    ((bytes[offset + 1] ?? 0) << 16) +
    ((bytes[offset + 2] ?? 0) << 8) +
    (bytes[offset + 3] ?? 0)
  );
}

/** @param {Uint8Array} bytes @param {number} offset */
function u32le(bytes, offset) {
  requireRange(bytes, offset, 4);
  return (
    (bytes[offset] ?? 0) +
    (bytes[offset + 1] ?? 0) * 0x100 +
    (bytes[offset + 2] ?? 0) * 0x10000 +
    (bytes[offset + 3] ?? 0) * 0x1000000
  );
}

/** @param {Uint8Array} bytes @param {number[]} signature */
function hasSignature(bytes, signature) {
  return signature.every((value, index) => bytes[index] === value);
}

/**
 * @param {number} width
 * @param {number} height
 * @param {'bmp' | 'gif' | 'jpg' | 'ktx' | 'png' | 'psd' | 'svg' | 'tiff' | 'webp'} type
 */
function dimensions(width, height, type) {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    width > MAX_DIMENSION ||
    height > MAX_DIMENSION
  ) {
    throw new TypeError('Invalid image dimensions');
  }
  return { width, height, type };
}

/** @param {Uint8Array} bytes */
function parsePng(bytes) {
  if (!hasSignature(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return null;
  requireRange(bytes, 8, 16);
  if (String.fromCharCode(...bytes.subarray(12, 16)) !== 'IHDR')
    throw new TypeError('PNG is missing IHDR');
  return dimensions(u32be(bytes, 16), u32be(bytes, 20), 'png');
}

/** @param {Uint8Array} bytes */
function parseJpeg(bytes) {
  if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;
  const startOfFrame = new Set([
    0xc0, 0xc1, 0xc2, 0xc3, 0xc5, 0xc6, 0xc7, 0xc9, 0xca, 0xcb, 0xcd, 0xce, 0xcf,
  ]);
  let offset = 2;
  for (let segment = 0; segment < MAX_JPEG_SEGMENTS && offset < bytes.length; segment += 1) {
    while (offset < bytes.length && bytes[offset] === 0xff) offset += 1;
    requireRange(bytes, offset, 1);
    const marker = bytes[offset] ?? 0;
    offset += 1;
    if (marker === 0xd9 || marker === 0xda) break;
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) continue;
    const length = u16be(bytes, offset);
    if (length < 2) throw new TypeError('Invalid JPEG segment length');
    if (startOfFrame.has(marker)) {
      requireRange(bytes, offset, 7);
      return dimensions(u16be(bytes, offset + 5), u16be(bytes, offset + 3), 'jpg');
    }
    requireRange(bytes, offset, length);
    offset += length;
  }
  throw new TypeError('JPEG dimensions not found');
}

/** @param {Uint8Array} bytes */
function parseGif(bytes) {
  const signature = String.fromCharCode(...bytes.subarray(0, 6));
  if (signature !== 'GIF87a' && signature !== 'GIF89a') return null;
  return dimensions(u16le(bytes, 6), u16le(bytes, 8), 'gif');
}

/** @param {Uint8Array} bytes */
function parseBmp(bytes) {
  if (bytes[0] !== 0x42 || bytes[1] !== 0x4d) return null;
  const headerSize = u32le(bytes, 14);
  if (headerSize === 12) return dimensions(u16le(bytes, 18), u16le(bytes, 20), 'bmp');
  requireRange(bytes, 18, 8);
  const width = new DataView(bytes.buffer, bytes.byteOffset + 18, 8).getInt32(0, true);
  const height = new DataView(bytes.buffer, bytes.byteOffset + 18, 8).getInt32(4, true);
  return dimensions(Math.abs(width), Math.abs(height), 'bmp');
}

/** @param {Uint8Array} bytes */
function parseWebp(bytes) {
  if (
    String.fromCharCode(...bytes.subarray(0, 4)) !== 'RIFF' ||
    String.fromCharCode(...bytes.subarray(8, 12)) !== 'WEBP'
  )
    return null;
  const chunk = String.fromCharCode(...bytes.subarray(12, 16));
  if (chunk === 'VP8X') return dimensions(u24le(bytes, 24) + 1, u24le(bytes, 27) + 1, 'webp');
  if (chunk === 'VP8L') {
    requireRange(bytes, 20, 5);
    if (bytes[20] !== 0x2f) throw new TypeError('Invalid WebP lossless signature');
    const packed = u32le(bytes, 21);
    return dimensions((packed & 0x3fff) + 1, ((packed >>> 14) & 0x3fff) + 1, 'webp');
  }
  if (chunk === 'VP8 ') {
    requireRange(bytes, 23, 7);
    if (!hasSignature(bytes.subarray(23), [0x9d, 0x01, 0x2a]))
      throw new TypeError('Invalid WebP frame header');
    return dimensions(u16le(bytes, 26) & 0x3fff, u16le(bytes, 28) & 0x3fff, 'webp');
  }
  throw new TypeError('Unsupported WebP encoding');
}

/** @param {Uint8Array} bytes */
function parsePsd(bytes) {
  if (String.fromCharCode(...bytes.subarray(0, 4)) !== '8BPS') return null;
  const version = u16be(bytes, 4);
  if (version !== 1 && version !== 2) throw new TypeError('Unsupported PSD version');
  return dimensions(u32be(bytes, 18), u32be(bytes, 14), 'psd');
}

/** @param {string | null} value */
function svgLength(value) {
  if (!value) return null;
  const match = /^\s*([0-9]+(?:\.[0-9]+)?)\s*(?:px)?\s*$/iu.exec(value);
  return match?.[1] ? Number(match[1]) : null;
}

/** @param {Uint8Array} bytes */
function parseSvg(bytes) {
  const text = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
  const opening = /<svg\b[^>]{0,4096}>/iu.exec(text)?.[0];
  if (!opening) return null;
  /** @param {string} name */
  const attribute = (name) =>
    new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`, 'iu').exec(opening)?.[1] ?? null;
  const width = svgLength(attribute('width'));
  const height = svgLength(attribute('height'));
  if (width && height) return dimensions(width, height, 'svg');
  const viewBox = attribute('viewBox')
    ?.trim()
    .split(/[\s,]+/u)
    .map(Number);
  if (viewBox?.length === 4 && viewBox.every(Number.isFinite))
    return dimensions(Math.abs(viewBox[2] ?? 0), Math.abs(viewBox[3] ?? 0), 'svg');
  throw new TypeError('SVG dimensions not found');
}

/** @param {Uint8Array} bytes */
function parseTiff(bytes) {
  const little = bytes[0] === 0x49 && bytes[1] === 0x49;
  const big = bytes[0] === 0x4d && bytes[1] === 0x4d;
  if (!little && !big) return null;
  const read16 = little ? u16le : u16be;
  const read32 = little ? u32le : u32be;
  if (read16(bytes, 2) !== 42) throw new TypeError('Invalid TIFF signature');
  const directoryOffset = read32(bytes, 4);
  const count = read16(bytes, directoryOffset);
  if (count > MAX_TIFF_ENTRIES) throw new TypeError('Too many TIFF entries');
  let width = null;
  let height = null;
  for (let index = 0; index < count; index += 1) {
    const offset = directoryOffset + 2 + index * 12;
    requireRange(bytes, offset, 12);
    const tag = read16(bytes, offset);
    const type = read16(bytes, offset + 2);
    const values = read32(bytes, offset + 4);
    if ((tag !== 256 && tag !== 257) || values !== 1 || (type !== 3 && type !== 4)) continue;
    const value = type === 3 ? read16(bytes, offset + 8) : read32(bytes, offset + 8);
    if (tag === 256) width = value;
    else height = value;
    if (width && height) return dimensions(width, height, 'tiff');
  }
  throw new TypeError('TIFF dimensions not found');
}

/** @param {Uint8Array} bytes */
function parseKtx(bytes) {
  const ktx1 = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x31, 0x31, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
  const ktx2 = [0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a];
  if (hasSignature(bytes, ktx1)) {
    const marker = u32le(bytes, 12);
    const read32 = marker === 0x04030201 ? u32le : marker === 0x01020304 ? u32be : null;
    if (!read32) throw new TypeError('Invalid KTX endianness marker');
    return dimensions(read32(bytes, 36), read32(bytes, 40), 'ktx');
  }
  if (hasSignature(bytes, ktx2)) return dimensions(u32le(bytes, 20), u32le(bytes, 24), 'ktx');
  return null;
}

/** @param {Uint8Array | string} input */
function readInput(input) {
  if (input instanceof Uint8Array) {
    if (input.length === 0 || input.length > MAX_INPUT_BYTES)
      throw new TypeError('Image input must be between 1 byte and 1 MiB');
    return input;
  }
  if (typeof input !== 'string') throw new TypeError('Input must be a Uint8Array or file path');
  const descriptor = openSync(input, 'r');
  try {
    const size = fstatSync(descriptor).size;
    if (size <= 0) throw new TypeError('Image file is empty');
    const bytes = new Uint8Array(Math.min(size, MAX_INPUT_BYTES));
    readSync(descriptor, bytes, 0, bytes.length, 0);
    return bytes;
  } finally {
    closeSync(descriptor);
  }
}

/** @param {Uint8Array | string} input */
function imageSize(input) {
  const bytes = readInput(input);
  const parsers = [
    parsePng,
    parseJpeg,
    parseGif,
    parseBmp,
    parseWebp,
    parsePsd,
    parseTiff,
    parseKtx,
    parseSvg,
  ];
  for (const parse of parsers) {
    const result = parse(bytes);
    if (result) return result;
  }
  throw new TypeError('Unsupported image type');
}

module.exports = imageSize;
module.exports.default = imageSize;
module.exports.imageSize = imageSize;
