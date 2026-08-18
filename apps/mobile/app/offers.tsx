import { useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, ScrollView, Text } from 'react-native';
import { z } from 'zod';
import { Button, Card, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { formatSar } from '@sallah/i18n';
import { useLocale } from '@/providers/locale-provider';

const offerSchema = z.object({
  id: z.uuid(),
  providerId: z.uuid(),
  providerName: z.string(),
  rating: z.coerce.number(),
  ratingCount: z.number().int(),
  completedJobs: z.number().int(),
  totalAmountMinor: z.number().int(),
  visitFeeMinor: z.number().int(),
  materialsIncluded: z.boolean(),
  materialsEstimateMinor: z.number().int().nullable(),
  estimatedArrivalMinutes: z.number().int(),
  estimatedDurationMinutes: z.number().int(),
  warrantyDays: z.number().int(),
  note: z.string(),
  expiresAt: z.string(),
  status: z.string(),
});

export default function Offers() {
  const { locale, t } = useLocale();
  const { requestId } = useLocalSearchParams<{ requestId?: string }>();
  const [error, setError] = useState('');
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['customer-offers', requestId],
    enabled: Boolean(requestId),
    queryFn: async () => {
      if (!requestId) return [];
      const { data, error: rpcError } = await supabase.rpc('get_customer_offers', {
        p_request_id: requestId,
      });
      if (rpcError) throw rpcError;
      return z.array(offerSchema).parse(data);
    },
  });
  const selectOffer = useMutation({
    mutationFn: async (offerId: string) => {
      const { data, error: rpcError } = await supabase.rpc('select_offer', {
        p_offer_id: offerId,
        p_idempotency_key: globalThis.crypto.randomUUID(),
      });
      if (rpcError) throw rpcError;
      return z.string().uuid().parse(data);
    },
    onSuccess: async (jobId) => {
      await queryClient.invalidateQueries({ queryKey: ['customer-requests'] });
      Alert.alert(t('offerSelectedTitle'), t('offerSelectedBody'));
      router.replace({ pathname: '/jobs', params: { jobId } });
    },
    onError: () => setError(t('offerSelectFailed')),
  });
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Screen>
        <Text style={styles.title}>{t('privateOffersTitle')}</Text>
        <Text style={styles.lead}>{t('privateOffersLead')}</Text>
        {!requestId && <Text style={styles.error}>{t('missingRequestId')}</Text>}
        {query.isPending && <Text style={styles.lead}>{t('loadingOffers')}</Text>}
        {query.isError && <Text style={styles.error}>{t('loadOffersFailed')}</Text>}
        {query.data?.map((offer) => (
          <Card key={offer.id}>
            <Text style={styles.badge}>{formatSar(offer.totalAmountMinor, locale)}</Text>
            <Text>{offer.providerName}</Text>
            <Text style={styles.lead}>
              {t('offerRatingSummary', {
                rating: offer.rating.toFixed(1),
                count: offer.ratingCount,
                jobs: offer.completedJobs,
              })}
            </Text>
            <Text style={styles.lead}>
              {t('offerTimingSummary', {
                arrival: offer.estimatedArrivalMinutes,
                duration: offer.estimatedDurationMinutes,
              })}
            </Text>
            <Text style={styles.lead}>
              {offer.materialsIncluded ? t('materialsIncluded') : t('materialsNotIncluded')} ·{' '}
              {t('warrantyDaysSummary', { days: offer.warrantyDays })}
            </Text>
            {offer.note.length > 0 && <Text>{offer.note}</Text>}
            <Button
              disabled={selectOffer.isPending}
              label={t('selectThisOffer')}
              onPress={() => selectOffer.mutate(offer.id)}
            />
          </Card>
        ))}
        {query.data?.length === 0 && <Text style={styles.lead}>{t('noActiveOffers')}</Text>}
        {error.length > 0 && <Text style={styles.error}>{error}</Text>}
      </Screen>
    </ScrollView>
  );
}
