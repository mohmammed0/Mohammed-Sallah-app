import { z } from 'zod';

// Locale-bound catalog data and punctuation; customer-facing copy remains in @sallah/i18n.
export const RIYADH_NAME_AR = '\u0627\u0644\u0631\u064a\u0627\u0636';
const ADDRESS_PART_SEPARATOR = '\u060c ';

export const coordinatesSchema = z
  .object({
    latitude: z.number().finite().min(-90).max(90),
    longitude: z.number().finite().min(-180).max(180),
  })
  .strict();
export type Coordinates = z.infer<typeof coordinatesSchema>;

export const supportedServiceLocationSchema = z
  .object({
    status: z.literal('supported'),
    countryCode: z.literal('SA'),
    city: z
      .object({
        id: z.uuid(),
        code: z.string().min(2).max(80),
        nameAr: z.string().min(1),
        nameEn: z.string().min(1),
      })
      .strict(),
  })
  .strict();

export const serviceLocationResolutionSchema = z.discriminatedUnion('status', [
  supportedServiceLocationSchema,
  z
    .object({
      status: z.enum(['location_unavailable', 'outside_saudi_arabia']),
      countryCode: z.null(),
      city: z.null(),
    })
    .strict(),
  z
    .object({
      status: z.literal('city_not_supported'),
      countryCode: z.literal('SA'),
      city: z.null(),
    })
    .strict(),
]);
export type ServiceLocationResolution = z.infer<typeof serviceLocationResolutionSchema>;

export const reverseGeocodeResultSchema = z
  .object({
    formattedAddress: z.string().max(500),
    city: z.string().max(120).nullable(),
    district: z.string().max(120).nullable(),
    region: z.string().max(120).nullable(),
    countryCode: z.string().max(3).nullable(),
  })
  .strict();
export type ReverseGeocodeResult = z.infer<typeof reverseGeocodeResultSchema>;

export const savedAddressSchema = z
  .object({
    id: z.uuid(),
    label: z.string(),
    formattedAddress: z.string(),
    building: z.string().nullable(),
    unit: z.string().nullable(),
    accessNotes: z.string().nullable(),
    cityCode: z.string(),
    cityNameAr: z.string(),
    cityNameEn: z.string(),
    isDefault: z.boolean(),
    coordinates: coordinatesSchema,
  })
  .strict();
export type SavedAddress = z.infer<typeof savedAddressSchema>;

export const savedAddressInputSchema = z
  .object({
    id: z.uuid().nullable(),
    label: z.string().trim().min(1).max(80),
    formattedAddress: z.string().trim().min(3).max(500),
    building: z.string().trim().max(80),
    unit: z.string().trim().max(80),
    accessNotes: z.string().trim().max(500),
    cityCode: z.string().trim().min(2).max(80),
    isDefault: z.boolean(),
    coordinates: coordinatesSchema,
  })
  .strict();
export type SavedAddressInput = z.infer<typeof savedAddressInputSchema>;

export function addressDisplayName(
  address: SavedAddress,
  locale: 'ar' | 'en' | 'ur' | 'hi',
): string {
  const city = locale === 'ar' || locale === 'ur' ? address.cityNameAr : address.cityNameEn;
  return address.formattedAddress.trim() || `${address.label} · ${city}`;
}

export function sanitizeReverseGeocode(
  result:
    | {
        formattedAddress?: string | null;
        name?: string | null;
        street?: string | null;
        district?: string | null;
        city?: string | null;
        region?: string | null;
      }
    | undefined,
): string {
  if (!result) return '';
  const explicit = result.formattedAddress?.trim();
  if (explicit) return explicit.slice(0, 500);
  return [result.name, result.street, result.district, result.city, result.region]
    .map((part) => part?.trim())
    .filter((part): part is string => Boolean(part))
    .filter((part, index, all) => all.indexOf(part) === index)
    .join(ADDRESS_PART_SEPARATOR)
    .slice(0, 500);
}

export function normalizeReverseGeocode(
  result:
    | {
        formattedAddress?: string | null;
        name?: string | null;
        street?: string | null;
        district?: string | null;
        city?: string | null;
        region?: string | null;
        isoCountryCode?: string | null;
      }
    | undefined,
): ReverseGeocodeResult | null {
  const formattedAddress = sanitizeReverseGeocode(result);
  if (!formattedAddress) return null;
  const normalize = (value: string | null | undefined, maximum: number) =>
    value?.trim().slice(0, maximum) || null;
  return reverseGeocodeResultSchema.parse({
    formattedAddress,
    city: normalize(result?.city, 120),
    district: normalize(result?.district, 120),
    region: normalize(result?.region, 120),
    countryCode: normalize(result?.isoCountryCode, 3)?.toUpperCase() ?? null,
  });
}

export function serviceLocationStatusKey(
  resolution: ServiceLocationResolution | null,
): 'locationUnavailable' | 'outsideSaudiArabia' | 'cityNotSupported' | 'serviceLocationResolved' {
  if (!resolution || resolution.status === 'location_unavailable') return 'locationUnavailable';
  if (resolution.status === 'outside_saudi_arabia') return 'outsideSaudiArabia';
  if (resolution.status === 'city_not_supported') return 'cityNotSupported';
  return 'serviceLocationResolved';
}

export function sameCoordinates(left: Coordinates, right: Coordinates): boolean {
  return (
    Math.abs(left.latitude - right.latitude) < 0.000001 &&
    Math.abs(left.longitude - right.longitude) < 0.000001
  );
}
