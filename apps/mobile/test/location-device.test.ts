import { describe, expect, it, vi } from 'vitest';

vi.mock('expo-location', () => ({
  Accuracy: { High: 4 },
  requestForegroundPermissionsAsync: vi.fn(),
  getLastKnownPositionAsync: vi.fn(),
  getCurrentPositionAsync: vi.fn(),
}));

import * as locationDevice from '../src/features/location/location-device';

const { acquireForegroundLocation } = locationDevice;

const lastKnown = {
  coords: { latitude: 24.7136, longitude: 46.6753 },
  timestamp: 1_000,
};
const accurate = {
  coords: { latitude: 24.714, longitude: 46.676 },
  timestamp: 2_000,
};

describe('foreground device location', () => {
  it('maps device outcomes to one safe localized recovery contract', () => {
    expect(locationDevice.locationRecoveryForResult({ status: 'denied_settings' })).toEqual({
      action: 'settings',
      messageKey: 'locationPermissionDenied',
    });
    expect(locationDevice.locationRecoveryForResult({ status: 'denied_retryable' })).toEqual({
      action: 'retry',
      messageKey: 'locationPermissionDenied',
    });
    expect(locationDevice.locationRecoveryForResult({ status: 'last_known_only' })).toEqual({
      action: null,
      messageKey: 'locationUsingRecentFix',
    });
    expect(locationDevice.locationRecoveryForResult({ status: 'unavailable' })).toEqual({
      action: null,
      messageKey: 'locationUnavailable',
    });
    expect(locationDevice.locationRecoveryForResult({ status: 'accurate' })).toEqual({
      action: null,
      messageKey: null,
    });
  });

  it('directs a permanently denied permission to Settings without reading location', async () => {
    const getLastKnownPosition = vi.fn();
    const getCurrentPosition = vi.fn();

    await expect(
      acquireForegroundLocation(vi.fn(), {
        requestForegroundPermission: async () => ({ granted: false, canAskAgain: false }),
        getLastKnownPosition,
        getCurrentPosition,
      }),
    ).resolves.toEqual({ status: 'denied_settings' });
    expect(getLastKnownPosition).not.toHaveBeenCalled();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('keeps a retryable denial separate from a permanent denial', async () => {
    await expect(
      acquireForegroundLocation(vi.fn(), {
        requestForegroundPermission: async () => ({ granted: false, canAskAgain: true }),
        getLastKnownPosition: vi.fn(),
        getCurrentPosition: vi.fn(),
      }),
    ).resolves.toEqual({ status: 'denied_retryable' });
  });

  it('shows a bounded recent position first and then replaces it with an accurate fix', async () => {
    const candidates: Array<{
      coordinates: { latitude: number; longitude: number };
      source: string;
    }> = [];
    const getLastKnownPosition = vi.fn().mockResolvedValue(lastKnown);
    const getCurrentPosition = vi.fn().mockResolvedValue(accurate);

    await expect(
      acquireForegroundLocation(
        async (candidate) => {
          candidates.push(candidate);
        },
        {
          requestForegroundPermission: async () => ({ granted: true, canAskAgain: true }),
          getLastKnownPosition,
          getCurrentPosition,
        },
      ),
    ).resolves.toEqual({ status: 'accurate' });

    expect(getLastKnownPosition).toHaveBeenCalledWith({
      maxAge: 60_000,
      requiredAccuracy: 500,
    });
    expect(candidates).toEqual([
      {
        coordinates: { latitude: 24.7136, longitude: 46.6753 },
        source: 'last_known',
      },
      {
        coordinates: { latitude: 24.714, longitude: 46.676 },
        source: 'accurate',
      },
    ]);
  });

  it('keeps the bounded last-known fix usable when the fresh fix is temporarily unavailable', async () => {
    const candidates: string[] = [];
    await expect(
      acquireForegroundLocation(
        async ({ source }) => {
          candidates.push(source);
        },
        {
          requestForegroundPermission: async () => ({ granted: true, canAskAgain: true }),
          getLastKnownPosition: async () => lastKnown,
          getCurrentPosition: async () => {
            throw new Error('device provider unavailable');
          },
        },
      ),
    ).resolves.toEqual({ status: 'last_known_only' });
    expect(candidates).toEqual(['last_known']);
  });

  it('reports unavailable when neither a recent nor a fresh fix exists', async () => {
    await expect(
      acquireForegroundLocation(vi.fn(), {
        requestForegroundPermission: async () => ({ granted: true, canAskAgain: true }),
        getLastKnownPosition: async () => null,
        getCurrentPosition: async () => {
          throw new Error('device provider unavailable');
        },
      }),
    ).resolves.toEqual({ status: 'unavailable' });
  });
});
