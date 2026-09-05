import { describe, expect, it } from 'vitest';
import { readPublicLegalConnection, readPublicSupportEmail } from '../src/web';

const environment = {
  NEXT_PUBLIC_APP_ENV: 'production',
  NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co',
  NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_fixture',
};

describe('public website configuration', () => {
  it('reads only an explicit public project connection', () => {
    expect(readPublicLegalConnection(environment)).toEqual({
      url: environment.NEXT_PUBLIC_SUPABASE_URL,
      key: environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
    });
    expect(readPublicLegalConnection({})).toBeNull();
    expect(readPublicLegalConnection({ SUPABASE_SECRET_KEY: 'never-use-this' })).toBeNull();
  });

  it('rejects private keys, malformed origins, placeholders and unknown environments', () => {
    const jwt = (role: string) =>
      `eyJhbGciOiJIUzI1NiJ9.${btoa(JSON.stringify({ role }))}.signature`;
    for (const overrides of [
      { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'sb_secret_fixture' },
      { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt('service_role') },
      { NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'arbitrary-key' },
      { NEXT_PUBLIC_SUPABASE_URL: 'https://fixture.supabase.co/rest/v1' },
      { NEXT_PUBLIC_SUPABASE_URL: 'https://user:private@fixture.supabase.co' },
      { NEXT_PUBLIC_SUPABASE_URL: 'https://project.example.invalid' },
      { NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321' },
      { NEXT_PUBLIC_APP_ENV: 'development' },
    ])
      expect(readPublicLegalConnection({ ...environment, ...overrides })).toBeNull();
    expect(
      readPublicLegalConnection({
        ...environment,
        NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: jwt('anon'),
      }),
    ).not.toBeNull();
    expect(
      readPublicLegalConnection({
        ...environment,
        NEXT_PUBLIC_APP_ENV: 'test',
        NEXT_PUBLIC_SUPABASE_URL: 'http://127.0.0.1:54321',
      }),
    ).not.toBeNull();
  });

  it('never replaces an unavailable support address with a placeholder', () => {
    for (const value of [
      undefined,
      '',
      'support@example.invalid',
      'support@localhost',
      'support@sallah.test',
      'user:secret',
      'support@127.0.0.1',
      'support@fixture.com?token=private',
    ]) {
      expect(readPublicSupportEmail({ SALLAH_SUPPORT_EMAIL: value })).toBeNull();
    }
    expect(readPublicSupportEmail({ SALLAH_SUPPORT_EMAIL: 'support@sallah-fixture.com' })).toBe(
      'support@sallah-fixture.com',
    );
  });
});
