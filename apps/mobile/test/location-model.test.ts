import { describe, expect, it } from 'vitest';
import {
  addressDisplayName,
  coordinatesSchema,
  sameCoordinates,
  sanitizeReverseGeocode,
  savedAddressSchema,
} from '../src/features/location/location-model';

describe('customer location model', () => {
  it('accepts Saudi coordinates and rejects coordinates outside the service boundary', () => {
    expect(coordinatesSchema.safeParse({ latitude: 24.7136, longitude: 46.6753 }).success).toBe(true);
    expect(coordinatesSchema.safeParse({ latitude: 51.5072, longitude: -0.1276 }).success).toBe(false);
  });

  it('normalizes reverse-geocoding without duplicating address parts', () => {
    expect(
      sanitizeReverseGeocode({
        name: '12',
        street: 'King Road',
        district: 'Al Olaya',
        city: 'Riyadh',
        region: 'Riyadh',
      }),
    ).toBe('12، King Road، Al Olaya، Riyadh');
  });

  it('parses the server address boundary and localizes the city fallback', () => {
    const address = savedAddressSchema.parse({
      id: '11111111-1111-4111-8111-111111111111',
      label: 'Home',
      formattedAddress: '',
      building: null,
      unit: null,
      accessNotes: null,
      cityCode: 'riyadh',
      cityNameAr: 'الرياض',
      cityNameEn: 'Riyadh',
      isDefault: true,
      coordinates: { latitude: 24.7136, longitude: 46.6753 },
    });
    expect(addressDisplayName(address, 'ar')).toBe('Home · الرياض');
    expect(addressDisplayName(address, 'en')).toBe('Home · Riyadh');
  });

  it('compares map coordinates at pin precision', () => {
    expect(
      sameCoordinates(
        { latitude: 24.7136001, longitude: 46.6753001 },
        { latitude: 24.7136002, longitude: 46.6753002 },
      ),
    ).toBe(true);
  });
});
