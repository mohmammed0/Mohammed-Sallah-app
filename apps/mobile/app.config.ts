import type { ConfigContext, ExpoConfig } from 'expo/config';
import { branding } from '@sallah/config/branding';
import { translate } from '@sallah/i18n';

export default ({ config }: ConfigContext): ExpoConfig => {
  const environment = process.env.EXPO_PUBLIC_APP_ENV ?? 'local';
  const production = environment === 'production';
  const projectId = process.env.EAS_PROJECT_ID;
  if (
    production &&
    (!projectId ||
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
      ...(process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY
        ? { config: { googleMaps: { apiKey: process.env.EXPO_PUBLIC_GOOGLE_MAPS_API_KEY } } }
        : {}),
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
      eas: projectId ? { projectId } : undefined,
      featureFlags: {
        phoneOtp: false,
        backgroundLocation: false,
        onlinePayments: false,
      },
    },
  };
};
