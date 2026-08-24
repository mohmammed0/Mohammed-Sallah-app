/// <reference types="node" />

import { afterEach, describe, expect, it } from 'vitest';

import createExpoConfig from '../app.config';

const keys = [
  'EXPO_PUBLIC_APP_ENV',
  'EAS_PROJECT_ID',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
] as const;
const saved = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

afterEach(() => {
  for (const key of keys) {
    const value = saved[key];
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
});

function build() {
  return createExpoConfig({ config: {} } as Parameters<typeof createExpoConfig>[0]);
}

describe('mobile Expo APP_ENV boundary', () => {
  it('fails closed when EXPO_PUBLIC_APP_ENV is missing or misspelled', () => {
    delete process.env.EXPO_PUBLIC_APP_ENV;
    expect(build).toThrow(/EXPO_PUBLIC_APP_ENV/);
    process.env.EXPO_PUBLIC_APP_ENV = 'locla';
    expect(build).toThrow(/EXPO_PUBLIC_APP_ENV/);
  });

  it.each(['local', 'test', 'preview'] as const)('accepts explicit %s', (environment) => {
    process.env.EXPO_PUBLIC_APP_ENV = environment;
    expect(build().extra?.appEnvironment).toBe(environment);
  });

  it('retains the production human-input gate after explicit environment validation', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    delete process.env.EAS_PROJECT_ID;
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(build).toThrow(/Production mobile build requires/);
  });
});
