import { describe, expect, it } from 'vitest';
import {
  parseProviderServiceCenter,
  preserveProviderSelections,
  type ProviderOnboardingDraft,
} from '../src/features/provider/onboarding-draft';

function ewkb({
  little = true,
  order = little ? 1 : 0,
  type = 0x20000001,
  srid = 4326,
  longitude = 46.7,
  latitude = 24.7,
} = {}) {
  const bytes = new Uint8Array(25);
  const view = new DataView(bytes.buffer);
  view.setUint8(0, order);
  view.setUint32(1, type, little);
  view.setUint32(5, srid, little);
  view.setFloat64(9, longitude, little);
  view.setFloat64(17, latitude, little);
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}
describe('owner service center trust boundary', () => {
  it.each([true, false])('reads EWKB Point/SRID 4326 with little endian = %s', (little) => {
    expect(parseProviderServiceCenter(ewkb({ little }))).toEqual({
      latitude: 24.7,
      longitude: 46.7,
    });
  });
  it.each([
    ewkb({ order: 2 }),
    ewkb({ type: 0x20000002 }),
    ewkb({ srid: 3857 }),
    ewkb({ longitude: Number.NaN }),
    ewkb({ latitude: Number.POSITIVE_INFINITY }),
    ewkb({ longitude: 181 }),
    ewkb({ latitude: -91 }),
    ewkb().slice(2),
    `${ewkb()}00`,
    'not-geometry',
    null,
    { latitude: 24.7, longitude: 46.7 },
  ])('rejects unsupported or malformed stored geometry %#', (value) => {
    expect(() => parseProviderServiceCenter(value)).toThrow();
  });
});

describe('explicit provider selection edits', () => {
  const saved = {
    services: [
      { categoryId: 'a', subcategoryId: 'specialty' },
      { categoryId: 'b', subcategoryId: null },
    ],
    serviceAreas: [{ cityId: 'old-city', location: { latitude: 24, longitude: 46 }, radiusKm: 10 }],
    availability: [
      { weekday: 2, start: '09:00:00', end: '12:00:00' },
      { weekday: 2, start: '13:00:00', end: '17:00:00' },
    ],
  } as ProviderOnboardingDraft;
  const input = {
    saved,
    categoryIds: ['a', 'c'],
    cityIds: ['old-city', 'new-city'],
    weekdays: [2, 4],
    location: { latitude: 21, longitude: 39 },
    locationChanged: false,
    radiusKm: 30,
    radiusChanged: false,
  };
  it('retains unchanged entries and applies defaults only to newly selected options', () => {
    expect(preserveProviderSelections(input)).toEqual({
      services: [
        { categoryId: 'a', subcategoryId: 'specialty' },
        { categoryId: 'c', subcategoryId: null },
      ],
      serviceAreas: [
        saved.serviceAreas[0],
        { cityId: 'new-city', location: input.location, radiusKm: 30 },
      ],
      availability: [...saved.availability, { weekday: 4, start: '08:00', end: '18:00' }],
    });
  });
  it('replaces centers and radii only after the corresponding explicit edit', () => {
    const result = preserveProviderSelections({
      ...input,
      locationChanged: true,
      radiusChanged: true,
    });
    expect(result.serviceAreas).toEqual(
      input.cityIds.map((cityId) => ({ cityId, location: input.location, radiusKm: 30 })),
    );
    expect(result.availability.slice(0, 2)).toEqual(saved.availability);
  });
  it('removes deselected cities, services and all time slots for a removed weekday', () => {
    expect(
      preserveProviderSelections({ ...input, categoryIds: ['b'], cityIds: [], weekdays: [4] }),
    ).toEqual({
      services: [{ categoryId: 'b', subcategoryId: null }],
      serviceAreas: [],
      availability: [{ weekday: 4, start: '08:00', end: '18:00' }],
    });
  });
});
