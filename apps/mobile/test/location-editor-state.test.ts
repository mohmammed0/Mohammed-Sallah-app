import { describe, expect, it, vi } from 'vitest';
import type { SavedAddress } from '../src/features/location/location-model';
import {
  createDebouncedResolver,
  initializeLocationEditor,
  shouldOfferTransientSave,
} from '../src/features/location/location-editor-state';
import { canAttemptCustomerMap } from '../src/features/location/map-readiness';

vi.mock('expo-constants', () => ({
  default: { appOwnership: null, expoConfig: { extra: {} } },
}));
vi.mock('react-native', () => ({ Platform: { OS: 'android' } }));

const home: SavedAddress = {
  id: '11111111-1111-4111-8111-111111111111',
  label: 'Home',
  formattedAddress: 'Riyadh home',
  building: '12',
  unit: null,
  accessNotes: null,
  cityCode: 'riyadh',
  cityNameAr: '\u0627\u0644\u0631\u064a\u0627\u0636',
  cityNameEn: 'Riyadh',
  isDefault: true,
  coordinates: { latitude: 24.7136, longitude: 46.6753 },
};

describe('saved-location editor state', () => {
  it('waits for the asynchronous address query before deriving a first default', () => {
    expect(
      initializeLocationEditor({
        loaded: false,
        addresses: [],
        editingAddressId: null,
        activeLocation: null,
        defaultLabel: 'Home',
      }),
    ).toBeNull();
    expect(
      initializeLocationEditor({
        loaded: true,
        addresses: [],
        editingAddressId: null,
        activeLocation: null,
        defaultLabel: 'Home',
      })?.makeDefault,
    ).toBe(true);
  });

  it('edits the actual address ID and preserves its current default state', () => {
    expect(
      initializeLocationEditor({
        loaded: true,
        addresses: [home],
        editingAddressId: home.id,
        activeLocation: null,
        defaultLabel: 'Other',
      }),
    ).toMatchObject({ id: home.id, label: 'Home', makeDefault: true });
  });

  it('offers Save only for a transient active location', () => {
    expect(shouldOfferTransientSave({ ...home, savedAddressId: null })).toBe(true);
    expect(shouldOfferTransientSave({ ...home, savedAddressId: home.id })).toBe(false);
  });

  it('debounces map movement and resolves only the final settled point', () => {
    vi.useFakeTimers();
    const run = vi.fn();
    const resolver = createDebouncedResolver(550, run);
    resolver.schedule({ latitude: 24.7, longitude: 46.6 });
    resolver.schedule({ latitude: 21.5, longitude: 39.1 });
    vi.advanceTimersByTime(549);
    expect(run).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(run).toHaveBeenCalledOnce();
    expect(run).toHaveBeenCalledWith({ latitude: 21.5, longitude: 39.1 });
    vi.useRealTimers();
  });

  it('renders Android maps only in Expo Go or a build with the restricted key', () => {
    expect(
      canAttemptCustomerMap({ platform: 'android', appOwnership: null, androidConfigured: false }),
    ).toBe(false);
    expect(
      canAttemptCustomerMap({
        platform: 'android',
        appOwnership: 'expo',
        androidConfigured: false,
      }),
    ).toBe(true);
    expect(
      canAttemptCustomerMap({ platform: 'android', appOwnership: null, androidConfigured: true }),
    ).toBe(true);
  });
});
