import type { ConfigContext, ExpoConfig } from 'expo/config';
import { branding } from '@sallah/config/branding';
import { appEnvironmentSchema } from '@sallah/config/env';
import { translate } from '@sallah/i18n';

const defaultEasOwner = 'binmuhayas-team';
const defaultEasProjectId = 'f098f941-ae73-4007-b582-ba6fb1b8aa7a';

export default ({ config }: ConfigContext): ExpoConfig => {
  const parsedEnvironment = appEnvironmentSchema.safeParse(process.env.EXPO_PUBLIC_APP_ENV);
  if (!parsedEnvironment.success) {
    throw new Error('EXPO_PUBLIC_APP_ENV must explicitly be local, test, preview, or production');
  }
  const environment = parsedEnvironment.data;
  const production = environment === 'production';
  // Build-time only. This key is restricted in Google Cloud to the Android
  // package name and signing certificate; it is never exposed through EXPO_PUBLIC_*.
  const androidMapsApiKey = process.env.SALLAH_ANDROID_GOOGLE_MAPS_API_KEY;
  const configuredProjectId = process.env.EAS_PROJECT_ID;
  const projectId = configuredProjectId ?? defaultEasProjectId;
  if (
    production &&
    (!configuredProjectId ||
      !process.env.EXPO_PUBLIC_SUPABASE_URL ||
      !process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY)
  ) {
    throw new Error(
      'Production mobile build requires EAS_PROJECT_ID and Supabase public configuration',
    );
  }
  return {
    ...config,
    name: branding.displayName.ar,
    slug: branding.slug,
    owner: defaultEasOwner,
    version: '0.1.0',
    platforms: ['ios', 'android'],
    orientation: 'portrait',
    scheme: branding.scheme,
    userInterfaceStyle: 'light',
    runtimeVersion: { policy: 'fingerprint' },
    ios: {
      supportsTablet: true,
      bundleIdentifier: process.env.SALLAH_IOS_BUNDLE_ID ?? branding.iosBundleIdentifier,
      infoPlist: { CFBundleAllowMixedLocalizations: true },
    },
    android: {
      package: process.env.SALLAH_ANDROID_PACKAGE ?? branding.androidPackage,
      adaptiveIcon: { backgroundColor: branding.colors.sand },
      blockedPermissions: ['android.permission.ACCESS_BACKGROUND_LOCATION'],
      ...(androidMapsApiKey ? { config: { googleMaps: { apiKey: androidMapsApiKey } } } : {}),
    },
    plugins: [
      'expo-router',
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
          microphonePermission: false,
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
};
