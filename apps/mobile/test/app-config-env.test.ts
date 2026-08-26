/// <reference types="node" />

import { afterEach, describe, expect, it } from 'vitest';

import createExpoConfig from '../app.config';

const keys = [
  'EXPO_PUBLIC_APP_ENV',
  'EAS_PROJECT_ID',
  'EXPO_PUBLIC_SUPABASE_URL',
  'EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY',
  'SALLAH_ANDROID_GOOGLE_MAPS_API_KEY',
  'SALLAH_ANDROID_PACKAGE',
  'SALLAH_IOS_BUNDLE_ID',
  'EAS_BUILD_PLATFORM',
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

function configurePreview() {
  process.env.EXPO_PUBLIC_APP_ENV = 'preview';
  process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://preview.invalid';
  process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'publishable-test-value';
  process.env.SALLAH_ANDROID_PACKAGE = 'com.mohmammed0.sallah.preview';
  process.env.SALLAH_IOS_BUNDLE_ID = 'com.mohmammed0.sallah.preview';
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
    if (environment === 'preview') {
      configurePreview();
      process.env.SALLAH_ANDROID_GOOGLE_MAPS_API_KEY = 'restricted-preview-key';
    }
    expect(build().extra?.appEnvironment).toBe(environment);
  });

  it('fails closed for Preview without the restricted Android Maps key', () => {
    configurePreview();
    process.env.EAS_BUILD_PLATFORM = 'android';
    delete process.env.SALLAH_ANDROID_GOOGLE_MAPS_API_KEY;
    expect(build).toThrow(/Preview and production mobile builds require.*Maps/i);
  });

  it('fails closed for Preview without Supabase public configuration', () => {
    configurePreview();
    process.env.SALLAH_ANDROID_GOOGLE_MAPS_API_KEY = 'restricted-preview-key';

    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    expect(build).toThrow(/Preview and production mobile builds require.*Supabase/i);

    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://preview.invalid';
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(build).toThrow(/Preview and production mobile builds require.*Supabase/i);
  });

  it('does not require the Android Maps key for an explicit iOS EAS Preview build', () => {
    configurePreview();
    process.env.EAS_BUILD_PLATFORM = 'ios';
    delete process.env.SALLAH_ANDROID_GOOGLE_MAPS_API_KEY;

    const result = build();

    expect(result.ios?.bundleIdentifier).toBe('com.mohmammed0.sallah.preview');
    expect(result.android?.config).toBeUndefined();
    expect(result.extra?.maps).toEqual({ androidConfigured: false });
  });

  it('fails safely for a Preview build with an unknown EAS platform and no Maps key', () => {
    configurePreview();
    process.env.EAS_BUILD_PLATFORM = 'windows';
    delete process.env.SALLAH_ANDROID_GOOGLE_MAPS_API_KEY;

    expect(build).toThrow(/Preview and production mobile builds require.*Maps/i);
  });

  it('configures foreground-only Maps plus explicit icon, splash and update policy', () => {
    configurePreview();
    process.env.EAS_BUILD_PLATFORM = 'android';
    process.env.SALLAH_ANDROID_GOOGLE_MAPS_API_KEY = 'restricted-preview-key';

    const result = build();

    expect(result.android).toMatchObject({
      package: 'com.mohmammed0.sallah.preview',
      blockedPermissions: ['android.permission.ACCESS_BACKGROUND_LOCATION'],
      config: { googleMaps: { apiKey: 'restricted-preview-key' } },
      adaptiveIcon: {
        backgroundColor: '#F6F0E7',
        foregroundImage: './assets/images/adaptive-icon.png',
      },
    });
    expect(result.ios?.bundleIdentifier).toBe('com.mohmammed0.sallah.preview');
    expect(result.icon).toBe('./assets/images/icon.png');
    expect(result.runtimeVersion).toEqual({ policy: 'fingerprint' });
    expect(result.updates).toEqual({
      enabled: false,
      checkAutomatically: 'NEVER',
      fallbackToCacheTimeout: 0,
    });
    expect(result.plugins).toContainEqual([
      'expo-splash-screen',
      {
        backgroundColor: '#F6F0E7',
        image: './assets/images/splash-icon.png',
        imageWidth: 180,
        resizeMode: 'contain',
      },
    ]);
    expect(result.extra?.maps).toEqual({ androidConfigured: true });
    expect(JSON.stringify(result.extra)).not.toContain('restricted-preview-key');
  });

  it('retains the production human-input gate after explicit environment validation', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    delete process.env.EAS_PROJECT_ID;
    delete process.env.EXPO_PUBLIC_SUPABASE_URL;
    delete process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    expect(build).toThrow(/Production mobile build requires/);
  });

  it('requires final production application IDs and a restricted Maps key', () => {
    process.env.EXPO_PUBLIC_APP_ENV = 'production';
    process.env.EAS_PROJECT_ID = 'f098f941-ae73-4007-b582-ba6fb1b8aa7a';
    process.env.EXPO_PUBLIC_SUPABASE_URL = 'https://preview.invalid';
    process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY = 'publishable-test-value';
    delete process.env.SALLAH_ANDROID_PACKAGE;
    delete process.env.SALLAH_IOS_BUNDLE_ID;
    delete process.env.SALLAH_ANDROID_GOOGLE_MAPS_API_KEY;

    expect(build).toThrow(/Production mobile build requires final Android and iOS identifiers/);

    process.env.SALLAH_ANDROID_PACKAGE = 'sa.sallah.app';
    process.env.SALLAH_IOS_BUNDLE_ID = 'sa.sallah.app';
    expect(build).toThrow(/Preview and production mobile builds require.*Maps/i);
  });
});
