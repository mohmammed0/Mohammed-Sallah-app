import { describe, expect, it } from 'vitest';

import { constantTimeHexEqual, hmacSha256Hex } from '../src/auth.js';

describe('scanner server-to-server HMAC primitives', () => {
  it('produces a lowercase SHA-256 HMAC and verifies exact fixed-length hexadecimal evidence', () => {
    const secret = 'control-secret-that-is-at-least-thirty-two-bytes';
    const signature = hmacSha256Hex(secret, 'canonical request');
    expect(signature).toMatch(/^[0-9a-f]{64}$/);
    expect(constantTimeHexEqual(signature, signature)).toBe(true);
    expect(constantTimeHexEqual(signature, `${signature.slice(0, 63)}0`)).toBe(false);
    expect(constantTimeHexEqual(signature, signature.toUpperCase())).toBe(false);
    expect(constantTimeHexEqual(signature, '0'.repeat(63))).toBe(false);
  });

  it('fails closed for short/oversized HMAC secrets without reflecting them', () => {
    for (const secret of ['short', 'x'.repeat(257)]) {
      expect(() => hmacSha256Hex(secret, 'message')).toThrowError('invalid_hmac_configuration');
    }
  });
});
