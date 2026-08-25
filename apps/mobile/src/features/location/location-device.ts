import * as Location from 'expo-location';

import { coordinatesSchema, type Coordinates } from './location-model';

const LAST_KNOWN_MAX_AGE_MS = 60_000;
const LAST_KNOWN_REQUIRED_ACCURACY_METERS = 500;

interface PermissionResult {
  granted: boolean;
  canAskAgain: boolean;
}

interface DeviceLocation {
  coords: { latitude: number; longitude: number };
  timestamp: number;
}

interface ForegroundLocationDependencies {
  requestForegroundPermission: () => Promise<PermissionResult>;
  getLastKnownPosition: (options: {
    maxAge: number;
    requiredAccuracy: number;
  }) => Promise<DeviceLocation | null>;
  getCurrentPosition: () => Promise<DeviceLocation>;
}

export interface ForegroundLocationCandidate {
  coordinates: Coordinates;
  source: 'last_known' | 'accurate';
}

export type ForegroundLocationResult =
  | { status: 'accurate' }
  | { status: 'last_known_only' }
  | { status: 'denied_retryable' }
  | { status: 'denied_settings' }
  | { status: 'unavailable' };

export interface ForegroundLocationRecovery {
  action: 'retry' | 'settings' | null;
  messageKey: 'locationPermissionDenied' | 'locationUsingRecentFix' | 'locationUnavailable' | null;
}

export function locationRecoveryForResult(
  result: ForegroundLocationResult,
): ForegroundLocationRecovery {
  switch (result.status) {
    case 'denied_settings':
      return { action: 'settings', messageKey: 'locationPermissionDenied' };
    case 'denied_retryable':
      return { action: 'retry', messageKey: 'locationPermissionDenied' };
    case 'last_known_only':
      return { action: null, messageKey: 'locationUsingRecentFix' };
    case 'unavailable':
      return { action: null, messageKey: 'locationUnavailable' };
    case 'accurate':
      return { action: null, messageKey: null };
  }
}

const expoLocationDependencies: ForegroundLocationDependencies = {
  requestForegroundPermission: Location.requestForegroundPermissionsAsync,
  getLastKnownPosition: Location.getLastKnownPositionAsync,
  getCurrentPosition: () => Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High }),
};

function toCoordinates(location: DeviceLocation): Coordinates {
  return coordinatesSchema.parse({
    latitude: location.coords.latitude,
    longitude: location.coords.longitude,
  });
}

export async function acquireForegroundLocation(
  onCandidate: (candidate: ForegroundLocationCandidate) => Promise<void> | void,
  dependencies: ForegroundLocationDependencies = expoLocationDependencies,
): Promise<ForegroundLocationResult> {
  const permission = await dependencies.requestForegroundPermission();
  if (!permission.granted) {
    return { status: permission.canAskAgain ? 'denied_retryable' : 'denied_settings' };
  }

  const currentPosition = dependencies
    .getCurrentPosition()
    .then((value) => ({ ok: true as const, value }))
    .catch(() => ({ ok: false as const }));
  const lastKnown = await dependencies
    .getLastKnownPosition({
      maxAge: LAST_KNOWN_MAX_AGE_MS,
      requiredAccuracy: LAST_KNOWN_REQUIRED_ACCURACY_METERS,
    })
    .catch(() => null);

  let emittedLastKnown = false;
  if (lastKnown) {
    try {
      await onCandidate({ coordinates: toCoordinates(lastKnown), source: 'last_known' });
      emittedLastKnown = true;
    } catch {
      emittedLastKnown = false;
    }
  }

  const current = await currentPosition;
  if (!current.ok) {
    return { status: emittedLastKnown ? 'last_known_only' : 'unavailable' };
  }

  try {
    await onCandidate({ coordinates: toCoordinates(current.value), source: 'accurate' });
    return { status: 'accurate' };
  } catch {
    return { status: emittedLastKnown ? 'last_known_only' : 'unavailable' };
  }
}
