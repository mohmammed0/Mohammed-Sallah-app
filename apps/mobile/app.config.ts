/// <reference types="node" />

import type { ConfigContext, ExpoConfig } from 'expo/config';
import { withAndroidManifest } from 'expo/config-plugins';
import { closeSync, fstatSync, openSync, readSync } from 'node:fs';
import { resolve } from 'node:path';
import { branding } from '@sallah/config/branding';
import { appEnvironmentSchema } from '@sallah/config/env';
import {
  nativeReleaseIdentitySchema,
  validateGoogleServicesConfiguration,
} from '@sallah/config/release';
import { supportedLocales, translate } from '@sallah/i18n';

const defaultEasOwner = 'binmuhayas-team';
const defaultEasProjectId = 'f098f941-ae73-4007-b582-ba6fb1b8aa7a';

export default ({ config }: ConfigContext): ExpoConfig => {
  const parsedEnvironment = appEnvironmentSchema.safeParse(process.env.EXPO_PUBLIC_APP_ENV);
  if (!parsedEnvironment.success) {
    throw new Error('EXPO_PUBLIC_APP_ENV must explicitly be local, test, preview, or production');
  }
  const environment = parsedEnvironment.data;
  const production = environment === 'production';
  const previewOrProduction = environment === 'preview' || production;
  const easBuildPlatform = process.env.EAS_BUILD_PLATFORM;
  // EAS sets EAS_BUILD_PLATFORM to the platform currently being configured.
  // Treat an absent or unrecognized value as Android-capable so Preview cannot
  // silently omit its restricted Maps key outside an explicit iOS-only build.
  const requiresAndroidMaps = easBuildPlatform !== 'ios';
  // Build-time only. This key is restricted in Google Cloud to the Android
  // package name and signing certificate; it is never exposed through EXPO_PUBLIC_*.
  const androidMapsApiKey = process.env.SALLAH_ANDROID_GOOGLE_MAPS_API_KEY;
  // Secret files are unavailable during local EAS config resolution. EAS_BUILD
  // is true on cloud/local build workers, where EAS provides the actual file.
  // Native prebuild also enforces a readable file below, without this marker.
  const googleServicesFile = process.env.GOOGLE_SERVICES_JSON;
  const configuredAndroidPackage = process.env.SALLAH_ANDROID_PACKAGE;
  const configuredIosBundleIdentifier = process.env.SALLAH_IOS_BUNDLE_ID;
  const configuredProjectId = process.env.EAS_PROJECT_ID;
  const projectId = configuredProjectId ?? defaultEasProjectId;
  if (
    previewOrProduction &&
    (!process.env.EXPO_PUBLIC_SUPABASE_URL || !process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  ) {
    throw new Error(
      production
        ? 'Production mobile build requires explicit Supabase public configuration'
        : 'Preview and production mobile builds require explicit Supabase public configuration',
    );
  }
  if (production && !configuredProjectId) {
    throw new Error('Production mobile build requires EAS_PROJECT_ID');
  }
  if (production && (!configuredAndroidPackage || !configuredIosBundleIdentifier)) {
    throw new Error('Production mobile build requires final Android and iOS identifiers');
  }
  if (production) {
    const identity = nativeReleaseIdentitySchema.safeParse({
      EAS_PROJECT_ID: configuredProjectId,
      SALLAH_ANDROID_PACKAGE: configuredAndroidPackage,
      SALLAH_IOS_BUNDLE_ID: configuredIosBundleIdentifier,
    });
    if (!identity.success) {
      const fields = [...new Set(identity.error.issues.map((issue) => issue.path.join('.')))];
      throw new Error(`Invalid production native identity: ${fields.join(', ')}`);
    }
  }
  if (previewOrProduction && requiresAndroidMaps && !androidMapsApiKey) {
    throw new Error(
      'Preview and production mobile builds require a restricted Android Maps API key',
    );
  }
  if (
    previewOrProduction &&
    requiresAndroidMaps &&
    process.env.EAS_BUILD === 'true' &&
    !googleServicesFile
  ) {
    throw new Error(
      'Preview and production Android builds require the Firebase app configuration file',
    );
  }
  if (environment === 'preview' && (!configuredAndroidPackage || !configuredIosBundleIdentifier)) {
    throw new Error('Preview mobile build requires explicit Android and iOS identifiers');
  }
  const expoConfig: ExpoConfig = {
    ...config,
    name: branding.displayName.ar,
    slug: branding.slug,
    owner: defaultEasOwner,
    version: '0.1.0',
    icon: './assets/images/icon.png',
    platforms: ['ios', 'android'],
    orientation: 'portrait',
    scheme: branding.scheme,
    userInterfaceStyle: 'light',
    locales: Object.fromEntries(
      supportedLocales.map((locale) => [
        locale,
        {
          ios: {
            NSCameraUsageDescription: translate(locale, 'permissionCamera'),
            NSPhotoLibraryUsageDescription: translate(locale, 'permissionPhotos'),
            NSMicrophoneUsageDescription: translate(locale, 'permissionMicrophone'),
            NSLocationWhenInUseUsageDescription: translate(locale, 'permissionLocation'),
            NSFaceIDUsageDescription: translate(locale, 'permissionFaceId'),
          },
        },
      ]),
    ),
    runtimeVersion: { policy: 'fingerprint' },
    updates: {
      enabled: false,
      checkAutomatically: 'NEVER',
      fallbackToCacheTimeout: 0,
    },
    ios: {
      supportsTablet: true,
      bundleIdentifier: configuredIosBundleIdentifier ?? branding.iosBundleIdentifier,
      buildNumber: '1',
      icon: './assets/images/icon.png',
      config: { usesNonExemptEncryption: false },
      infoPlist: {
        CFBundleAllowMixedLocalizations: true,
        CFBundleLocalizations: [...supportedLocales],
      },
    },
    android: {
      package: configuredAndroidPackage ?? branding.androidPackage,
      ...(googleServicesFile ? { googleServicesFile } : {}),
      versionCode: 1,
      icon: './assets/images/icon.png',
      adaptiveIcon: {
        backgroundColor: branding.colors.sand,
        foregroundImage: './assets/images/adaptive-icon.png',
        monochromeImage: './assets/images/adaptive-icon-monochrome.png',
      },
      blockedPermissions: [
        'android.permission.ACCESS_BACKGROUND_LOCATION',
        'android.permission.SYSTEM_ALERT_WINDOW',
      ],
      ...(androidMapsApiKey ? { config: { googleMaps: { apiKey: androidMapsApiKey } } } : {}),
    },
    plugins: [
      'expo-router',
      'expo-asset',
      [
        'expo-secure-store',
        {
          configureAndroidBackup: true,
          faceIDPermission: translate('ar', 'permissionFaceId'),
        },
      ],
      [
        'expo-image-picker',
        {
          photosPermission: translate('ar', 'permissionPhotos'),
          cameraPermission: translate('ar', 'permissionCamera'),
          // false blocks RECORD_AUDIO for the whole Android app, including expo-audio.
          microphonePermission: translate('ar', 'permissionMicrophone'),
        },
      ],
      [
        'expo-audio',
        {
          microphonePermission: translate('ar', 'permissionMicrophone'),
          enableBackgroundRecording: false,
          enableBackgroundPlayback: false,
        },
      ],
      [
        'expo-location',
        {
          locationWhenInUsePermission: translate('ar', 'permissionLocation'),
          isIosBackgroundLocationEnabled: false,
          isAndroidBackgroundLocationEnabled: false,
        },
      ],
      [
        'expo-splash-screen',
        {
          backgroundColor: branding.colors.sand,
          image: './assets/images/splash-icon.png',
          imageWidth: 180,
          resizeMode: 'contain',
        },
      ],
      ['expo-notifications', { defaultChannel: 'service-updates' }],
    ],
    experiments: { typedRoutes: true },
    extra: {
      appEnvironment: environment,
      eas: { projectId },
      featureFlags: {
        phoneOtp: false,
        backgroundLocation: false,
        onlinePayments: false,
      },
      maps: { androidConfigured: Boolean(androidMapsApiKey) },
    },
  };
  if (!previewOrProduction) return expoConfig;
  return withAndroidManifest(expoConfig, (nativeConfig) => {
    const file = nativeConfig.android?.googleServicesFile;
    let descriptor: number | undefined;
    try {
      if (!file) throw new Error('FIREBASE_FILE_MISSING');
      const absoluteFile = resolve(nativeConfig.modRequest.projectRoot, file);
      descriptor = openSync(absoluteFile, 'r');
      const metadata = fstatSync(descriptor);
      const maximumBytes = 262_144;
      if (!metadata.isFile() || metadata.size > maximumBytes) {
        throw new Error('FIREBASE_FILE_INVALID');
      }
      // Bound the read too, including a file that grows after fstat.
      const buffer = Buffer.alloc(maximumBytes + 1);
      const bytes = readSync(descriptor, buffer, 0, buffer.length, 0);
      if (bytes > maximumBytes) throw new Error('FIREBASE_FILE_TOO_LARGE');
      validateGoogleServicesConfiguration(
        buffer.subarray(0, bytes).toString('utf8'),
        nativeConfig.android?.package,
      );
    } catch {
      throw new Error(
        'Android native builds require a valid Firebase client configuration matching the Android package',
      );
    } finally {
      if (descriptor !== undefined) closeSync(descriptor);
    }
    return nativeConfig;
  });
};
