import Constants from 'expo-constants';
import { Platform } from 'react-native';

export const MAP_RENDER_TIMEOUT_MS = 5_000;
export const REVERSE_GEOCODE_DEBOUNCE_MS = 550;

interface MapsExtra {
  maps?: { androidConfigured?: boolean };
}

export function canAttemptCustomerMap(input: {
  platform: string;
  appOwnership: string | null;
  androidConfigured: boolean;
}): boolean {
  if (input.platform !== 'android') return true;
  return input.appOwnership === 'expo' || input.androidConfigured;
}

export function isCustomerMapConfigured(): boolean {
  const extra = (Constants.expoConfig?.extra ?? {}) as MapsExtra;
  return canAttemptCustomerMap({
    platform: Platform.OS,
    appOwnership: Constants.appOwnership,
    androidConfigured: extra.maps?.androidConfigured === true,
  });
}
