import { z } from 'zod';

const coordinatesSchema = z.object({
  latitude: z.number().finite().min(-90).max(90),
  longitude: z.number().finite().min(-180).max(180),
});

// Direct PostgREST geography reads are EWKB hex. Accept only the stored 2D
// Point/SRID 4326 contract; malformed or unexpected geometry must block editing.
// https://supabase.com/docs/guides/database/extensions/postgis
export function parseProviderServiceCenter(value: unknown) {
  const hex = z
    .string()
    .regex(/^[0-9a-f]{50}$/i)
    .parse(value);
  const bytes = Uint8Array.from(hex.match(/../g)!, (byte) => Number.parseInt(byte, 16));
  const view = new DataView(bytes.buffer);
  const order = view.getUint8(0);
  const littleEndian = order === 1;
  if (
    (order !== 0 && order !== 1) ||
    view.getUint32(1, littleEndian) !== 0x20000001 ||
    view.getUint32(5, littleEndian) !== 4326
  )
    throw new Error('INVALID_PROVIDER_SERVICE_CENTER');
  return coordinatesSchema.parse({
    longitude: view.getFloat64(9, littleEndian),
    latitude: view.getFloat64(17, littleEndian),
  });
}

const profileSchema = z.object({
  kind: z.enum(['individual', 'company']),
  business_name: z.string().max(160).nullable(),
  commercial_registration_reference: z.string().max(100).nullable(),
  bio: z.string().max(2000).nullable(),
  service_radius_km: z.number().finite().min(1).max(250),
  verification_status: z.enum([
    'draft',
    'submitted',
    'under_review',
    'more_information_required',
    'verified',
    'rejected',
    'suspended',
  ]),
  updated_at: z.iso.datetime({ offset: true }),
});
const timeSchema = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d{1,6})?)?$/);
const draftSchema = z.object({
  profile: profileSchema.nullable(),
  services: z.array(z.object({ category_id: z.uuid(), subcategory_id: z.uuid().nullable() })),
  areas: z.array(
    z.object({
      city_id: z.uuid(),
      center: z.unknown(),
      radius_m: z.number().int().positive().nullable(),
    }),
  ),
  availability: z.array(
    z.object({
      weekday: z.number().int().min(0).max(6),
      start_time: timeSchema,
      end_time: timeSchema,
    }),
  ),
  documents: z.array(z.object({ id: z.uuid() })),
});

export function parseProviderOnboardingDraft(value: unknown) {
  const data = draftSchema.parse(value);
  if (!data.profile) return null;
  const profile = data.profile;
  return {
    profile,
    services: data.services.map((service) => ({
      categoryId: service.category_id,
      subcategoryId: service.subcategory_id,
    })),
    serviceAreas: data.areas.map((area) => ({
      cityId: area.city_id,
      location: area.center === null ? null : parseProviderServiceCenter(area.center),
      radiusKm: area.radius_m === null ? profile.service_radius_km : area.radius_m / 1000,
    })),
    availability: data.availability.map((slot) => ({
      weekday: slot.weekday,
      start: slot.start_time,
      end: slot.end_time,
    })),
    documentCount: data.documents.length,
  };
}
export type ProviderOnboardingDraft = NonNullable<ReturnType<typeof parseProviderOnboardingDraft>>;

export function preserveProviderSelections(input: {
  saved: ProviderOnboardingDraft | null;
  categoryIds: string[];
  cityIds: string[];
  weekdays: number[];
  location: z.infer<typeof coordinatesSchema> | null;
  locationChanged: boolean;
  radiusKm: number;
  radiusChanged: boolean;
}) {
  return {
    services: input.categoryIds.map(
      (categoryId) =>
        input.saved?.services.find((service) => service.categoryId === categoryId) ?? {
          categoryId,
          subcategoryId: null,
        },
    ),
    serviceAreas: input.cityIds.flatMap((cityId) => {
      const retained = input.saved?.serviceAreas.filter((area) => area.cityId === cityId) ?? [];
      return (
        retained.length
          ? retained
          : [{ cityId, location: input.location, radiusKm: input.radiusKm }]
      ).map((area) => ({
        ...area,
        location: input.locationChanged ? input.location : area.location,
        radiusKm: input.radiusChanged ? input.radiusKm : area.radiusKm,
      }));
    }),
    availability: input.weekdays.flatMap((weekday) => {
      const retained = input.saved?.availability.filter((slot) => slot.weekday === weekday) ?? [];
      return retained.length ? retained : [{ weekday, start: '08:00', end: '18:00' }];
    }),
  };
}
