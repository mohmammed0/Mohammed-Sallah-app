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
  it('rejects deterministic upload scanning in production', () =>
    expect(() =>
      validateServerEnvironment({
        ...base,
        APP_ENV: 'production',
        SUPABASE_SECRET_KEY: 'secret',
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'test-key',
      }),
    ).toThrow(/external scanning is required/));
  it('accepts a fully configured external production scanner contract', () =>
    expect(
      validateServerEnvironment({
        ...base,
        APP_ENV: 'production',
        SUPABASE_SECRET_KEY: 'secret',
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'test-key',
        UPLOAD_SCANNER_MODE: 'external',
        UPLOAD_SCANNER_URL: 'https://scanner.example.invalid/v1/scan',
        UPLOAD_SCANNER_SECRET: 'scanner-secret-at-least-24-characters',
      }).UPLOAD_SCANNER_MODE,
    ).toBe('external'));
});
