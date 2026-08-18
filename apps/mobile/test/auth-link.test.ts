import { describe, expect, it } from 'vitest';
import { parseAuthLinkParams } from '../src/features/auth/auth-link';

describe('password recovery deep links', () => {
  it('accepts a PKCE recovery code', () => {
    expect(parseAuthLinkParams({ code: 'one-time-code' })).toEqual({
      kind: 'pkce',
      code: 'one-time-code',
    });
  });

  it('accepts a recovery session token pair', () => {
    expect(parseAuthLinkParams({ access_token: 'access', refresh_token: 'refresh' })).toEqual({
      kind: 'session',
      accessToken: 'access',
      refreshToken: 'refresh',
    });
  });

  it('fails closed for expired or malformed recovery links', () => {
    expect(() => parseAuthLinkParams({ error_code: 'otp_expired' })).toThrow(
      'INVALID_OR_EXPIRED_AUTH_LINK',
    );
    expect(() => parseAuthLinkParams({ access_token: 'missing-refresh' })).toThrow(
      'INVALID_OR_EXPIRED_AUTH_LINK',
    );
  });
});
