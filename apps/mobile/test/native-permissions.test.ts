/// <reference types="node" />

import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmdirSync, unlinkSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AndroidConfig, compileModsAsync, withPlugins } from 'expo/config-plugins';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { supportedLocales, translate } from '@sallah/i18n';

import createExpoConfig from '../app.config';

afterEach(() => vi.unstubAllEnvs());

function configureNativePreview(file: string) {
  vi.stubEnv('EXPO_PUBLIC_APP_ENV', 'preview');
  vi.stubEnv('EXPO_PUBLIC_SUPABASE_URL', 'https://preview.invalid');
  vi.stubEnv('EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY', 'publishable-test-value');
  vi.stubEnv('SALLAH_ANDROID_PACKAGE', 'com.mohmammed0.sallah.preview');
  vi.stubEnv('SALLAH_IOS_BUNDLE_ID', 'com.mohmammed0.sallah.preview');
  vi.stubEnv('SALLAH_ANDROID_GOOGLE_MAPS_API_KEY', 'restricted-test-key');
  vi.stubEnv('GOOGLE_SERVICES_JSON', file);
  vi.stubEnv('EAS_BUILD', '');
  return createExpoConfig({ config: {} } as Parameters<typeof createExpoConfig>[0]);
}

function compileNativePreview(file: string) {
  return compileModsAsync(configureNativePreview(file), {
    projectRoot: fileURLToPath(new URL('..', import.meta.url)),
    introspect: true,
    ignoreExistingNativeFiles: true,
    platforms: ['android'],
  });
}

const syntheticFirebase = {
  project_info: { project_id: 'synthetic-sallah-test', project_number: '123456' },
  client: [
    {
      client_info: {
        mobilesdk_app_id: 'synthetic-android-app',
        android_client_info: { package_name: 'com.mohmammed0.sallah.preview' },
      },
      api_key: [{ current_key: 'synthetic-client-key-not-live' }],
    },
  ],
};

async function withFirebaseFixture(content: string, test: (file: string) => Promise<void>) {
  const directory = mkdtempSync(join(tmpdir(), 'sallah-firebase-test-'));
  const file = join(directory, 'synthetic-google-services.json');
  try {
    writeFileSync(file, content, { encoding: 'utf8', mode: 0o600, flag: 'wx' });
    await test(file);
  } finally {
    unlinkSync(file);
    rmdirSync(directory);
  }
}

async function introspectPermissions() {
  vi.stubEnv('EXPO_PUBLIC_APP_ENV', 'test');
  const config = createExpoConfig({ config: {} } as Parameters<typeof createExpoConfig>[0]);
  const projectRoot = fileURLToPath(new URL('..', import.meta.url));
  const permissionPlugins = config.plugins?.filter((plugin) =>
    ['expo-image-picker', 'expo-audio', 'expo-location'].includes(
      typeof plugin === 'string' ? plugin : plugin[0],
    ),
  );

  // Run the installed plugins together, in app order, through Expo's native
  // manifest compiler. Introspection never generates or writes native files.
  const compiled = await compileModsAsync(
    AndroidConfig.Permissions.withInternalBlockedPermissions(
      withPlugins({ ...config, _internal: { projectRoot } }, permissionPlugins ?? []),
    ),
    {
      projectRoot,
      introspect: true,
      ignoreExistingNativeFiles: true,
      platforms: ['android', 'ios'],
    },
  );

  return compiled._internal?.modResults as {
    android: { manifest: AndroidConfig.Manifest.AndroidManifest };
    ios: { infoPlist: Record<string, unknown> };
  };
}

describe('composed native permissions', () => {
  it.each(['test', 'preview'] as const)(
    'loads %s configuration through the Expo CLI without an EAS secret file',
    (environment) => {
      const require = createRequire(import.meta.url);
      const cli = join(dirname(require.resolve('expo/package.json')), 'bin/cli');
      const output = execFileSync(process.execPath, [cli, 'config', '--json'], {
        cwd: fileURLToPath(new URL('..', import.meta.url)),
        env: {
          ...process.env,
          EXPO_PUBLIC_APP_ENV: environment,
          EXPO_NO_DOTENV: '1',
          EXPO_PUBLIC_SUPABASE_URL: 'https://preview.invalid',
          EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'publishable-test-value',
          SALLAH_ANDROID_PACKAGE: 'com.mohmammed0.sallah.preview',
          SALLAH_IOS_BUNDLE_ID: 'com.mohmammed0.sallah.preview',
          SALLAH_ANDROID_GOOGLE_MAPS_API_KEY: 'restricted-test-key',
          GOOGLE_SERVICES_JSON: '',
          EAS_BUILD: '',
        },
        encoding: 'utf8',
        timeout: 30_000,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      const config = JSON.parse(output) as { extra?: { appEnvironment?: string } };

      expect(config.extra?.appEnvironment).toBe(environment);
    },
  );

  it.each(['', 'missing-synthetic-google-services.json', '.'])(
    'rejects Android native compilation without a readable Firebase file (%s)',
    async (file) => {
      await expect(compileNativePreview(file)).rejects.toThrow(
        /Android native builds require a .*Firebase .*configuration/,
      );
    },
  );

  it.each([
    ['malformed JSON', '{synthetic-private-content'],
    [
      'server credential',
      JSON.stringify({
        ...syntheticFirebase,
        client: [{ ...syntheticFirebase.client[0], private_key: 'synthetic-private-content' }],
      }),
    ],
    [
      'different Android package',
      JSON.stringify({
        ...syntheticFirebase,
        client: [
          {
            ...syntheticFirebase.client[0],
            client_info: {
              ...syntheticFirebase.client[0]?.client_info,
              android_client_info: { package_name: 'com.synthetic.other' },
            },
          },
        ],
      }),
    ],
    [
      'oversized UTF-8 bytes',
      JSON.stringify({
        ...syntheticFirebase,
        project_info: { ...syntheticFirebase.project_info, project_id: '\u0633'.repeat(131073) },
      }),
    ],
  ])('rejects native Firebase %s without exposing file content or path', async (_name, content) => {
    await withFirebaseFixture(content!, async (file) => {
      const error = await compileNativePreview(file).then(
        () => null,
        (caught: unknown) => caught,
      );
      expect(error).toBeInstanceOf(Error);
      expect(String(error)).toContain(
        'Android native builds require a valid Firebase client configuration',
      );
      expect(String(error)).not.toContain(file);
      expect(String(error)).not.toContain('synthetic-private-content');
    });
  });

  it('accepts a bounded client-only native fixture matching the configured Android package', async () => {
    await withFirebaseFixture(JSON.stringify(syntheticFirebase), async (file) => {
      const config = await compileNativePreview(file);
      expect(config.android?.googleServicesFile).toBe(file);
    });
  });

  it('provides iOS system permission translations for every supported app language', () => {
    vi.stubEnv('EXPO_PUBLIC_APP_ENV', 'test');
    const config = createExpoConfig({ config: {} } as Parameters<typeof createExpoConfig>[0]);

    expect(config.ios?.infoPlist?.CFBundleLocalizations).toEqual([...supportedLocales]);
    for (const locale of supportedLocales) {
      expect(config.locales?.[locale]).toEqual({
        ios: {
          NSCameraUsageDescription: translate(locale, 'permissionCamera'),
          NSPhotoLibraryUsageDescription: translate(locale, 'permissionPhotos'),
          NSMicrophoneUsageDescription: translate(locale, 'permissionMicrophone'),
          NSLocationWhenInUseUsageDescription: translate(locale, 'permissionLocation'),
          NSFaceIDUsageDescription: translate(locale, 'permissionFaceId'),
        },
      });
    }
  });

  it('keeps voice recording available after image-picker and audio configure the manifest', async () => {
    const result = await introspectPermissions();
    const microphone = result.android.manifest.manifest['uses-permission']?.filter(
      (permission) => permission.$['android:name'] === 'android.permission.RECORD_AUDIO',
    );

    expect(microphone).toEqual([{ $: { 'android:name': 'android.permission.RECORD_AUDIO' } }]);
    expect(result.ios.infoPlist.NSMicrophoneUsageDescription).toBe(
      translate('ar', 'permissionMicrophone'),
    );
  });

  it('does not enable background audio or background location as a recording workaround', async () => {
    const result = await introspectPermissions();
    const manifest = result.android.manifest.manifest;

    expect(manifest['uses-permission']).toContainEqual({
      $: {
        'android:name': 'android.permission.ACCESS_BACKGROUND_LOCATION',
        'tools:node': 'remove',
      },
    });
    const enabledPermissions = manifest['uses-permission']
      ?.filter((permission) => permission.$['tools:node'] !== 'remove')
      .map((permission) => permission.$['android:name']);
    expect(enabledPermissions).not.toContain('android.permission.FOREGROUND_SERVICE_MICROPHONE');
    expect(enabledPermissions).not.toContain(
      'android.permission.FOREGROUND_SERVICE_MEDIA_PLAYBACK',
    );
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(result.android.manifest);
    expect(application.service ?? []).toEqual([]);
    expect(result.ios.infoPlist.UIBackgroundModes ?? []).not.toContain('audio');
    expect(result.ios.infoPlist.UIBackgroundModes ?? []).not.toContain('location');
  });
});
