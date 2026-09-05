import type { Coordinates, SavedAddress } from './location-model';

export interface ActiveServiceLocation {
  savedAddressId: string | null;
  label: string;
  formattedAddress: string;
  building: string | null;
  unit: string | null;
  accessNotes: string | null;
  cityCode: string;
  cityNameAr: string;
  cityNameEn: string;
  coordinates: Coordinates;
}

export function customerLocationStorageKey(userId: string): string {
  return '@sallah/customer-location/' + userId;
}

export function toActiveServiceLocation(address: SavedAddress): ActiveServiceLocation {
  return {
    savedAddressId: address.id,
    label: address.label,
    formattedAddress: address.formattedAddress,
    building: address.building,
    unit: address.unit,
    accessNotes: address.accessNotes,
    cityCode: address.cityCode,
    cityNameAr: address.cityNameAr,
    cityNameEn: address.cityNameEn,
    coordinates: address.coordinates,
  };
}

export function resolveActiveSavedAddress(
  addresses: readonly SavedAddress[],
  preferredAddressId: string | null,
): SavedAddress | null {
  return (
    addresses.find((address) => address.id === preferredAddressId) ??
    addresses.find((address) => address.isDefault) ??
    addresses[0] ??
    null
  );
}
