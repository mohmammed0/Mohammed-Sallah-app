/// <reference types="node" />

import { spawnSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { validateServerEnvironment } from '../src/env';
import {
  productionRequiredKeys,
  validateProductionConfiguration,
} from '../../../scripts/production-config-validation.mjs';

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../../..');
const productionValidator = resolve(repositoryRoot, 'scripts/validate-production-config.mjs');

const base = {
  APP_ENV: 'local',
  SUPABASE_URL: 'http://127.0.0.1:54321',
  SUPABASE_PUBLISHABLE_KEY: 'local',
  SALLAH_PUBLIC_URL: 'http://localhost:3000',
  SALLAH_SUPPORT_EMAIL: 'support@example.invalid',
  UPLOAD_SCANNER_MODE: 'deterministic',
};

const externalScanner = {
  UPLOAD_SCANNER_MODE: 'external',
  UPLOAD_SCANNER_CONTROL_ORIGIN: 'https://project.supabase.co',
  UPLOAD_SCANNER_STORAGE_ORIGIN: 'https://project.supabase.co',
  UPLOAD_SCANNER_STORAGE_S3_ACCESS_KEY_ID: 'scanner-edge-only-access-key',
  UPLOAD_SCANNER_STORAGE_S3_SECRET_ACCESS_KEY:
    'scanner-edge-only-secret-that-is-at-least-thirty-two-bytes',
  UPLOAD_SCANNER_STORAGE_S3_REGION: 'eu-west-1',
  UPLOAD_SCANNER_CONTROL_SECRET: 'scanner-control-secret-at-least-32-chars',
  UPLOAD_SCANNER_ATTESTATION_SECRET: 'scanner-attestation-secret-at-least-32-chars',
  UPLOAD_SCANNER_NETWORK_POLICY: 'private-only',
  UPLOAD_SCANNER_SIGNATURE_MAX_AGE_HOURS: '24',
  UPLOAD_SCANNER_MAX_CONCURRENT_JOBS: '1',
  UPLOAD_SCANNER_JOB_DEADLINE_SECONDS: '120',
  UPLOAD_SCANNER_CONTROL_TIMEOUT_MS: '5000',
  UPLOAD_SCANNER_WORKER_ID: 'scanner-worker-1',
  UPLOAD_SCANNER_IDLE_DELAY_MS: '1000',
  UPLOAD_SCANNER_ALERTS_ENABLED: 'true',
};

const productionBase = {
  ...base,
  ...externalScanner,
  APP_ENV: 'production',
  SUPABASE_SECRET_KEY: 'secret',
  AI_PROVIDER: 'openai',
  OPENAI_API_KEY: 'test-key',
};

const pushContract = {
  PUSH_ENABLED: 'true',
  EXPO_ACCESS_TOKEN: 'expo-access-token-test-only-0000000000',
  PUSH_TOKEN_ENCRYPTION_KEY: 'A'.repeat(43),
  NOTIFICATION_WORKER_SECRET: 'notification-worker-secret-at-least-32-bytes',
};

const productionGateBase = {
  ...productionBase,
  ...pushContract,
  SUPABASE_URL: 'https://project.supabase.co',
  SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_test_only',
  SUPABASE_SECRET_KEY: 'test-service-secret-not-a-real-key',
  SALLAH_PUBLIC_URL: 'https://sallah.test',
  SALLAH_SUPPORT_EMAIL: 'support@sallah.test',
  SALLAH_PRIVACY_URL: 'https://sallah.test/privacy',
  SALLAH_TERMS_URL: 'https://sallah.test/terms',
  SALLAH_LEGAL_ENTITY: 'Sallah Test Entity',
  EAS_PROJECT_ID: 'test-project-id',
  SALLAH_IOS_BUNDLE_ID: 'sa.sallah.test',
  SALLAH_ANDROID_PACKAGE: 'sa.sallah.test',
  SALLAH_ANDROID_GOOGLE_MAPS_API_KEY: 'test-maps-key',
};

function runNode(args: string[], overrides: Record<string, string | undefined>, timeout = 2_000) {
  const env: NodeJS.ProcessEnv = { ...process.env, ...productionGateBase, ...overrides };
  for (const [key, value] of Object.entries(env)) if (value === undefined) delete env[key];
  return spawnSync(process.execPath, args, {
    cwd: repositoryRoot,
    env,
    encoding: 'utf8',
    timeout,
    killSignal: 'SIGTERM',
    windowsHide: true,
  });
}

function runProductionGate(overrides: Record<string, string | undefined>) {
  return runNode(['--experimental-strip-types', productionValidator], overrides);
}

describe('environment safety', () => {
  it('requires an explicit recognized APP_ENV', () => {
    expect(() => validateServerEnvironment({ ...base, APP_ENV: undefined })).toThrow(
      /APP_ENV|Invalid environment/,
    );
    expect(() => validateServerEnvironment({ ...base, APP_ENV: 'locla' })).toThrow(
      /APP_ENV|Invalid environment/,
    );
  });

  it('requires an explicit scanner mode even in local/test', () => {
    expect(() => validateServerEnvironment({ ...base, UPLOAD_SCANNER_MODE: undefined })).toThrow(
      /UPLOAD_SCANNER_MODE|Invalid environment/,
    );
    expect(validateServerEnvironment(base).UPLOAD_SCANNER_MODE).toBe('deterministic');
    expect(validateServerEnvironment({ ...base, APP_ENV: 'test' }).UPLOAD_SCANNER_MODE).toBe(
      'deterministic',
    );
  });

  it('rejects deterministic scanning outside explicit local/test', () => {
    expect(() => validateServerEnvironment({ ...base, APP_ENV: 'preview' })).toThrow(
      /test\/local-only/,
    );
    expect(() =>
      validateServerEnvironment({
        ...base,
        APP_ENV: 'production',
        SUPABASE_SECRET_KEY: 'secret',
        AI_PROVIDER: 'openai',
        OPENAI_API_KEY: 'test-key',
      }),
    ).toThrow(/external scanning is required/);
  });

  it('requires the complete external scanner control contract', () => {
    for (const key of Object.keys(externalScanner)) {
      if (key === 'UPLOAD_SCANNER_MODE') continue;
      expect(() =>
        validateServerEnvironment({
          ...productionBase,
          [key]: undefined,
        }),
      ).toThrow(new RegExp(key));
    }
  });

  it('requires exact HTTPS default-port origins without credentials, path, query, fragment, or IP literal', () => {
    for (const key of ['UPLOAD_SCANNER_CONTROL_ORIGIN', 'UPLOAD_SCANNER_STORAGE_ORIGIN'] as const) {
      for (const value of [
        'http://project.supabase.co',
        'https://project.supabase.co:8443',
        'https://user:password@project.supabase.co',
        'https://project.supabase.co/functions/v1',
        'https://project.supabase.co?debug=true',
        'https://project.supabase.co#fragment',
        'https://127.0.0.1',
        'https://8.8.8.8',
        'https://[2001:4860:4860::8888]',
      ]) {
        expect(() => validateServerEnvironment({ ...productionBase, [key]: value })).toThrow(
          new RegExp(key),
        );
      }
    }
  });

  it('permits HTTP origins only in explicit local/test external mode', () => {
    const localExternal = {
      ...base,
      ...externalScanner,
      UPLOAD_SCANNER_CONTROL_ORIGIN: 'http://127.0.0.1:54321',
      UPLOAD_SCANNER_STORAGE_ORIGIN: 'http://127.0.0.1:54321',
      UPLOAD_SCANNER_ALERTS_ENABLED: 'false',
    };
    expect(validateServerEnvironment(localExternal).APP_ENV).toBe('local');
    expect(validateServerEnvironment({ ...localExternal, APP_ENV: 'test' }).APP_ENV).toBe('test');
  });

  it('requires distinct byte-bounded control and attestation secrets', () => {
    expect(() =>
      validateServerEnvironment({
        ...productionBase,
        UPLOAD_SCANNER_ATTESTATION_SECRET: productionBase.UPLOAD_SCANNER_CONTROL_SECRET,
      }),
    ).toThrow(/must differ/);
    expect(() =>
      validateServerEnvironment({
        ...productionBase,
        UPLOAD_SCANNER_CONTROL_SECRET: 'أ'.repeat(129),
      }),
    ).toThrow(/UPLOAD_SCANNER_CONTROL_SECRET/);
  });

  it('requires bounded Edge-only S3 signing credentials for clipped output capabilities', () => {
    for (const overrides of [
      { UPLOAD_SCANNER_STORAGE_S3_ACCESS_KEY_ID: 'short' },
      { UPLOAD_SCANNER_STORAGE_S3_SECRET_ACCESS_KEY: 'short' },
      { UPLOAD_SCANNER_STORAGE_S3_REGION: 'EU WEST 1' },
    ]) {
      expect(() => validateServerEnvironment({ ...productionBase, ...overrides })).toThrow();
    }
  });

  it('pins one active job, the 120-second deadline, and bounded metadata timeout', () => {
    for (const overrides of [
      { UPLOAD_SCANNER_MAX_CONCURRENT_JOBS: '2' },
      { UPLOAD_SCANNER_JOB_DEADLINE_SECONDS: '119' },
      { UPLOAD_SCANNER_JOB_DEADLINE_SECONDS: '121' },
      { UPLOAD_SCANNER_CONTROL_TIMEOUT_MS: '99' },
      { UPLOAD_SCANNER_CONTROL_TIMEOUT_MS: '6000' },
      { UPLOAD_SCANNER_CONTROL_TIMEOUT_MS: '10001' },
      { UPLOAD_SCANNER_NETWORK_POLICY: 'public' },
      { UPLOAD_SCANNER_ALERTS_ENABLED: 'false' },
    ]) {
      expect(() => validateServerEnvironment({ ...productionBase, ...overrides })).toThrow();
    }
  });

  it('keeps existing production provider guards', () => {
    expect(() =>
      validateServerEnvironment({ ...productionBase, PAYMENT_PROVIDER: 'fake' }),
    ).toThrow(/forbidden/);
    expect(() =>
      validateServerEnvironment({ ...productionBase, AI_PROVIDER: 'deterministic' }),
    ).toThrow(/test\/local-only/);
  });

  it('requires the complete encrypted push worker contract whenever push is enabled', () => {
    for (const key of [
      'EXPO_ACCESS_TOKEN',
      'PUSH_TOKEN_ENCRYPTION_KEY',
      'NOTIFICATION_WORKER_SECRET',
    ] as const) {
      expect(() =>
        validateServerEnvironment({
          ...productionBase,
          ...pushContract,
          [key]: undefined,
        }),
      ).toThrow(new RegExp(key));
    }
    expect(validateServerEnvironment({ ...productionBase, ...pushContract }).PUSH_ENABLED).toBe(
      true,
    );
  });

  it('accepts the complete external production contract', () => {
    const result = validateServerEnvironment(productionBase);
    expect(result.UPLOAD_SCANNER_MODE).toBe('external');
    expect(result.UPLOAD_SCANNER_JOB_DEADLINE_SECONDS).toBe(120);
    expect(result.UPLOAD_SCANNER_MAX_CONCURRENT_JOBS).toBe(1);
  });

  it('makes the named production gate enforce every scanner variable', () => {
    for (const key of productionRequiredKeys) {
      if (!key.startsWith('UPLOAD_SCANNER_')) continue;
      const result = validateProductionConfiguration({
        ...productionGateBase,
        [key]: undefined,
      });
      expect(result.message, key).toMatch(/scann(?:er|ing)/i);
      expect(result.ok, key).toBe(false);
    }

    const rejected = runProductionGate({ UPLOAD_SCANNER_MODE: undefined });
    expect(`${rejected.stdout}${rejected.stderr}`).toMatch(/scann(?:er|ing)/i);
    expect(rejected.status).not.toBe(0);
    const accepted = runProductionGate({});
    expect(accepted.status, `${accepted.stdout}${accepted.stderr}`).toBe(0);
  });

  it('makes the named production gate enforce the encrypted push worker contract', () => {
    for (const key of [
      'PUSH_ENABLED',
      'EXPO_ACCESS_TOKEN',
      'PUSH_TOKEN_ENCRYPTION_KEY',
      'NOTIFICATION_WORKER_SECRET',
    ] as const) {
      const result = validateProductionConfiguration({
        ...productionGateBase,
        [key]: undefined,
      });
      expect(result.message, key).toMatch(/push|EXPO|NOTIFICATION/i);
      expect(result.ok, key).toBe(false);
    }
    expect(
      validateProductionConfiguration({ ...productionGateBase, PUSH_ENABLED: 'false' }).ok,
    ).toBe(false);
  });

  it('blocks placeholder scanner origins and HMAC secrets in the named production gate', () => {
    for (const [key, value] of [
      ['UPLOAD_SCANNER_CONTROL_ORIGIN', 'https://scanner.example.invalid'],
      ['UPLOAD_SCANNER_STORAGE_ORIGIN', 'https://storage.example.invalid'],
      ['UPLOAD_SCANNER_CONTROL_SECRET', 'changeme-scanner-control-secret-000000'],
      ['UPLOAD_SCANNER_ATTESTATION_SECRET', 'placeholder-scanner-attestation-00000'],
    ] as const) {
      const result = validateProductionConfiguration({ ...productionGateBase, [key]: value });
      expect(result.ok, key).toBe(false);
      expect(result.message, key).toMatch(/Production configuration blocked.*placeholder/i);
    }
  });

  it('bounds validator subprocesses and restores the parent environment', () => {
    const before = process.env.APP_ENV;
    const result = runNode(['-e', 'setInterval(() => undefined, 1_000)'], {}, 100);

    expect(result.error?.message).toMatch(/timed out|ETIMEDOUT/i);
    expect(result.status).toBeNull();
    expect(process.env.APP_ENV).toBe(before);
  });
});
