import { describe, expect, it } from 'vitest';
import { validateServerEnvironment } from '../src/env';

const base = {
  APP_ENV: 'local',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_PUBLISHABLE_KEY: 'local',
  SALLAH_PUBLIC_URL: 'http://localhost:3000',
  SALLAH_SUPPORT_EMAIL: 'support@example.invalid',
};

describe('environment safety', () => {
  it('accepts safe local defaults', () =>
    expect(validateServerEnvironment(base).PAYMENT_PROVIDER).toBe('offline'));
  it('rejects fake production payments', () =>
    expect(() =>
      validateServerEnvironment({ ...base, APP_ENV: 'production', PAYMENT_PROVIDER: 'fake' }),
    ).toThrow(/forbidden/));
  it('rejects deterministic AI in production', () =>
    expect(() =>
      validateServerEnvironment({ ...base, APP_ENV: 'production', SUPABASE_SECRET_KEY: 'secret' }),
    ).toThrow(/test\/local-only/));
});
