import { describe, expect, it } from 'vitest';
import type { SavedAddress } from '../src/features/location/location-model';
import {
  customerLocationStorageKey,
  resolveActiveSavedAddress,
  toActiveServiceLocation,
} from '../src/features/location/location-state';

const home: SavedAddress = {
  id: '11111111-1111-4111-8111-111111111111',
  label: 'Home',
  formattedAddress: 'Synthetic home address',
  building: null,
  unit: null,
  accessNotes: null,
  cityCode: 'riyadh',
  cityNameAr: 'الرياض',
  cityNameEn: 'Riyadh',
  isDefault: true,
  coordinates: { latitude: 24.7136, longitude: 46.6753 },
};

const work: SavedAddress = {
  ...home,
  id: '22222222-2222-4222-8222-222222222222',
  label: 'Work',
  formattedAddress: 'Synthetic work address',
  isDefault: false,
};

describe('customer active location state', () => {
  it('keeps the persisted selection isolated by authenticated user', () => {
    expect(customerLocationStorageKey('user-a')).not.toBe(customerLocationStorageKey('user-b'));
  });

  it('prefers an explicit saved location and falls back to the default', () => {
    expect(resolveActiveSavedAddress([home, work], work.id)?.id).toBe(work.id);
    expect(resolveActiveSavedAddress([home, work], '33333333-3333-4333-8333-333333333333')?.id).toBe(
      home.id,
    );
  });

  it('maps a saved address to the privacy-bounded active-location contract', () => {
    expect(toActiveServiceLocation(home)).toEqual({
      savedAddressId: home.id,
      label: 'Home',
      formattedAddress: 'Synthetic home address',
      building: null,
      unit: null,
      accessNotes: null,
      cityCode: 'riyadh',
      cityNameAr: 'الرياض',
      cityNameEn: 'Riyadh',
      coordinates: { latitude: 24.7136, longitude: 46.6753 },
    });
  });

  it('returns no active location on a fresh install with no saved addresses', () => {
    expect(resolveActiveSavedAddress([], null)).toBeNull();
  });
});
