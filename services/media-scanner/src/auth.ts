import { createHmac, timingSafeEqual } from 'node:crypto';

const MIN_SECRET_BYTES = 32;
const MAX_SECRET_BYTES = 256;

export class ScannerAuthError extends Error {
  override readonly name = 'ScannerAuthError';

  constructor() {
    super('invalid_hmac_configuration');
  }
}

export function hmacSha256Hex(secret: string, message: string): string {
  const size = Buffer.byteLength(secret, 'utf8');
  if (size < MIN_SECRET_BYTES || size > MAX_SECRET_BYTES) throw new ScannerAuthError();
  return createHmac('sha256', secret).update(message, 'utf8').digest('hex');
}

export function constantTimeHexEqual(expected: string, presented: string): boolean {
  if (!/^[0-9a-f]{64}$/.test(expected) || !/^[0-9a-f]{64}$/.test(presented)) return false;
  return timingSafeEqual(Buffer.from(expected, 'hex'), Buffer.from(presented, 'hex'));
}
