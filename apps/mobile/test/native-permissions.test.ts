/// <reference types="node" />

import { execFileSync } from 'node:child_process';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { AndroidConfig, compileModsAsync, withPlugins } from 'expo/config-plugins';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { supportedLocales, translate } from '@sallah/i18n';

import createExpoConfig from '../app.config';

afterEach(() => vi.unstubAllEnvs());

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
  it('loads native configuration through the Expo CLI used by EAS', () => {
    const require = createRequire(import.meta.url);
    const cli = join(dirname(require.resolve('expo/package.json')), 'bin/cli');
    const output = execFileSync(process.execPath, [cli, 'config', '--json'], {
      cwd: fileURLToPath(new URL('..', import.meta.url)),
      env: { ...process.env, EXPO_PUBLIC_APP_ENV: 'test', EXPO_NO_DOTENV: '1' },
      encoding: 'utf8',
      timeout: 30_000,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const config = JSON.parse(output) as { extra?: { appEnvironment?: string } };

    expect(config.extra?.appEnvironment).toBe('test');
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
