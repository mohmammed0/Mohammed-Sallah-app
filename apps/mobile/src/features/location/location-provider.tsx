import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { listMySavedAddresses } from './location-service';
import {
  customerLocationStorageKey,
  resolveActiveSavedAddress,
  toActiveServiceLocation,
  type ActiveServiceLocation,
} from './location-state';
import type { SavedAddress } from './location-model';
import { useSessionContext } from '@/providers/session-provider';

export type { ActiveServiceLocation } from './location-state';

const persistedAddressIdSchema = z.string().uuid();

interface CustomerLocationState {
  addresses: SavedAddress[];
  activeLocation: ActiveServiceLocation | null;
  loading: boolean;
  error: boolean;
  selectSavedAddress: (addressId: string) => Promise<void>;
  selectTransientLocation: (location: ActiveServiceLocation) => void;
  refresh: () => Promise<void>;
}

const CustomerLocationContext = createContext<CustomerLocationState | null>(null);

export function CustomerLocationProvider({ children }: PropsWithChildren) {
  const { session, context } = useSessionContext();
  const userId = session?.user.id ?? null;
  const customerEnabled = Boolean(userId && context?.roles.includes('customer'));
  const [preferredAddressId, setPreferredAddressId] = useState<string | null>(null);
  const [transientLocation, setTransientLocation] = useState<ActiveServiceLocation | null>(null);
  const [storageLoading, setStorageLoading] = useState(true);
  const query = useQuery({
    queryKey: ['customer-saved-addresses', userId],
    queryFn: listMySavedAddresses,
    enabled: customerEnabled,
  });

  useEffect(() => {
    let active = true;
    setPreferredAddressId(null);
    setTransientLocation(null);
    if (!userId) {
      setStorageLoading(false);
      return () => {
        active = false;
      };
    }
    setStorageLoading(true);
    void AsyncStorage.getItem(customerLocationStorageKey(userId))
      .then((stored) => {
        if (!active || !stored) return;
        const parsed = persistedAddressIdSchema.safeParse(stored);
        if (parsed.success) setPreferredAddressId(parsed.data);
      })
      .catch(() => undefined)
      .finally(() => {
        if (active) setStorageLoading(false);
      });
    return () => {
      active = false;
    };
  }, [userId]);

  const savedActive = resolveActiveSavedAddress(query.data ?? [], preferredAddressId);
  const activeLocation = transientLocation ?? (savedActive ? toActiveServiceLocation(savedActive) : null);

  const selectSavedAddress = useCallback(
    async (addressId: string) => {
      const validId = persistedAddressIdSchema.parse(addressId);
      if (!userId) throw new Error('SAVED_ADDRESS_NOT_AVAILABLE');
      await AsyncStorage.setItem(customerLocationStorageKey(userId), validId);
      setPreferredAddressId(validId);
      setTransientLocation(null);
    },
    [userId],
  );

  const selectTransientLocation = useCallback((location: ActiveServiceLocation) => {
    setTransientLocation({ ...location, savedAddressId: null });
  }, []);

  const refresh = useCallback(async () => {
    await query.refetch();
  }, [query]);

  const value = useMemo<CustomerLocationState>(
    () => ({
      addresses: query.data ?? [],
      activeLocation,
      loading: storageLoading || (customerEnabled && query.isPending),
      error: query.isError,
      selectSavedAddress,
      selectTransientLocation,
      refresh,
    }),
    [
      query.data,
      query.isError,
      query.isPending,
      activeLocation,
      storageLoading,
      customerEnabled,
      selectSavedAddress,
      selectTransientLocation,
      refresh,
    ],
  );

  return (
    <CustomerLocationContext.Provider value={value}>
      {children}
    </CustomerLocationContext.Provider>
  );
}

export function useCustomerLocation(): CustomerLocationState {
  const value = useContext(CustomerLocationContext);
  if (!value) throw new Error('CustomerLocationProvider is required');
  return value;
}
