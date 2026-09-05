import { createContext, useContext, useEffect, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { MarketplaceApi, type LegalConsentContext, type LegalDocument } from '@sallah/api';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/providers/locale-provider';
import { useSessionContext } from '@/providers/session-provider';

interface LegalConsentState {
  context: LegalConsentContext | undefined;
  loading: boolean;
  error: boolean;
  canEnter: boolean;
  refresh: () => Promise<void>;
  accept: (
    documents: Pick<LegalDocument, 'id' | 'contentHash'>[],
    idempotencyKey: string,
  ) => Promise<void>;
}
const LegalConsentContext = createContext<LegalConsentState | null>(null);
const api = new MarketplaceApi(supabase);

export function LegalConsentProvider({ children }: PropsWithChildren) {
  const { locale } = useLocale();
  const { session, loading } = useSessionContext();
  const queryClient = useQueryClient();
  const queryKey = ['legal-consent', session?.user.id ?? 'anonymous', locale];
  const query = useQuery({
    queryKey,
    queryFn: () => api.getLegalConsentContext(locale),
    enabled: !loading,
    staleTime: 0,
    gcTime: 0,
    retry: false,
  });
  const canEnter =
    !query.isError &&
    !query.isPending &&
    (query.data?.status === 'accepted' || query.data?.status === 'not_required');
  const refetch = query.refetch;
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refetch();
    });
    return () => subscription.remove();
  }, [refetch]);
  return (
    <LegalConsentContext.Provider
      value={{
        context: query.isError ? undefined : query.data,
        loading: loading || query.isPending || query.isFetching,
        error: query.isError,
        canEnter,
        refresh: async () => {
          await query.refetch();
        },
        accept: async (documents, idempotencyKey) => {
          const result = await api.acceptCurrentLegalDocuments({
            locale,
            documents,
            idempotencyKey,
          });
          queryClient.setQueryData(queryKey, result);
        },
      }}
    >
      {children}
    </LegalConsentContext.Provider>
  );
}

export function useLegalConsent() {
  const value = useContext(LegalConsentContext);
  if (!value) throw new Error('LEGAL_CONSENT_PROVIDER_REQUIRED');
  return value;
}
