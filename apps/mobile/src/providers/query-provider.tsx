import { useEffect, useState } from 'react';
import { QueryClient, QueryClientProvider, onlineManager } from '@tanstack/react-query';
import * as Network from 'expo-network';
import { isNetworkOnline } from '@/features/connectivity/network-state';
import { useSessionContext } from '@/providers/session-provider';

export function AppQueryProvider({ children }: { children: React.ReactNode }) {
  const { session } = useSessionContext();
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
  return (
    <IdentityQueryProvider key={session?.user.id ?? 'anonymous'}>{children}</IdentityQueryProvider>
  );
}

function IdentityQueryProvider({ children }: { children: React.ReactNode }) {
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1, refetchOnReconnect: true },
          mutations: { retry: 0 },
        },
      }),
  );
  // A different identity must never observe cached data or late responses from
  // the previous account. Same-user token/context refreshes keep this boundary.
  useEffect(() => () => client.clear(), [client]);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
