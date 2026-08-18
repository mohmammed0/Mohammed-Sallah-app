export type AuthLinkPayload =
  { kind: 'pkce'; code: string } | { kind: 'session'; accessToken: string; refreshToken: string };

export function parseAuthLinkParams(
  queryParams: Record<string, string | string[] | undefined> | null | undefined,
): AuthLinkPayload {
  const errorCode = queryParams?.error_code ?? queryParams?.error;
  if (typeof errorCode === 'string') throw new Error('INVALID_OR_EXPIRED_AUTH_LINK');
  const code = queryParams?.code;
  if (typeof code === 'string' && code.length > 0) return { kind: 'pkce', code };
  const accessToken = queryParams?.access_token;
  const refreshToken = queryParams?.refresh_token;
  if (
    typeof accessToken === 'string' &&
    accessToken.length > 0 &&
    typeof refreshToken === 'string' &&
    refreshToken.length > 0
  ) {
    return { kind: 'session', accessToken, refreshToken };
  }
  throw new Error('INVALID_OR_EXPIRED_AUTH_LINK');
}
