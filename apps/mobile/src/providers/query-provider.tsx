import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { isNetworkOnline } from '@/features/connectivity/network-state';

export function AppQueryProvider({ children }: { children: React.ReactNode }) {
  useEffect(
    () =>
      onlineManager.setEventListener((setOnline) => {
        void Network.getNetworkStateAsync()
          .then((state) => setOnline(isNetworkOnline(state)))
          .catch(() => undefined);
        const subscription = Network.addNetworkStateListener((state) => {
          setOnline(isNetworkOnline(state));
        });
        return () => subscription.remove();
      }),
    [],
  );
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnReconnect: true },
          mutations: { retry: 0 },
        },
      }),
  );
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
