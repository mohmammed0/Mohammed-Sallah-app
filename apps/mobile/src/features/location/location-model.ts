import { z } from 'zod';

export const RIYADH_NAME_AR = '\u0627\u0644\u0631\u064a\u0627\u0636';
const ADDRESS_PART_SEPARATOR = '\u060c ';

export const coordinatesSchema = z
  .object({
    latitude: z.number().finite().min(16).max(33),
    longitude: z.number().finite().min(34).max(56),
  })
  .strict();
export type Coordinates = z.infer<typeof coordinatesSchema>;

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

export function sameCoordinates(left: Coordinates, right: Coordinates): boolean {
  return (
    Math.abs(left.latitude - right.latitude) < 0.000001 &&
    Math.abs(left.longitude - right.longitude) < 0.000001
  );
}
