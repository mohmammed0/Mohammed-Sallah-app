import { z } from 'zod';
import { supabase } from '@/lib/supabase';
import {
  coordinatesSchema,
  savedAddressInputSchema,
  savedAddressSchema,
  serviceLocationResolutionSchema,
  type Coordinates,
  type SavedAddress,
  type SavedAddressInput,
  type ServiceLocationResolution,
} from './location-model';

const rpcResultSchema = z.array(savedAddressSchema);

type Rpc = (
  name: string,
  args?: Record<string, unknown>,
) => Promise<{ data: unknown; error: { message?: string } | null }>;

function rpc(): Rpc {
  return supabase.rpc.bind(supabase) as unknown as Rpc;
}

export async function listMySavedAddresses(): Promise<SavedAddress[]> {
  const { data, error } = await rpc()('list_my_saved_addresses');
  if (error) throw new Error('SAVED_ADDRESS_LIST_FAILED');
  return rpcResultSchema.parse(data ?? []);
}

export async function saveMyAddress(input: SavedAddressInput): Promise<string> {
  const payload = savedAddressInputSchema.parse(input);
  const { data, error } = await rpc()('upsert_my_saved_address', { payload });
  if (error) throw new Error('SAVED_ADDRESS_WRITE_FAILED');
  return z.string().uuid().parse(data);
}

export async function archiveMyAddress(addressId: string): Promise<void> {
  const { error } = await rpc()('archive_my_saved_address', {
    p_address_id: z.uuid().parse(addressId),
  });
  if (error) throw new Error('SAVED_ADDRESS_ARCHIVE_FAILED');
}

export async function makeMyAddressDefault(addressId: string): Promise<void> {
  const { error } = await rpc()('make_my_saved_address_default', {
    p_address_id: z.uuid().parse(addressId),
  });
  if (error) throw new Error('SAVED_ADDRESS_DEFAULT_FAILED');
}

export async function resolveServiceLocation(
  coordinates: Coordinates,
): Promise<ServiceLocationResolution> {
  const point = coordinatesSchema.parse(coordinates);
  const { data, error } = await rpc()('resolve_service_location', {
    p_latitude: point.latitude,
    p_longitude: point.longitude,
  });
  if (error) throw new Error('SERVICE_LOCATION_RESOLUTION_FAILED');
  return serviceLocationResolutionSchema.parse(data);
}
