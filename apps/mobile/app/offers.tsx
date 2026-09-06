import { useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import {
  ActionButton,
  CustomerScreen,
  EmptyState,
  LoadingBlock,
  Notice,
  Surface,
  customerStyles,
} from '@/design-system/primitives';
import { AppIcon } from '@/design-system/icon';
import { customerTokens as tokens } from '@/design-system/tokens';
import {
  logicalFlexDirection,
  logicalTextAlignment,
  logicalWritingDirection,
} from '@/design-system/rtl';
import { supabase } from '@/lib/supabase';
import { formatSar } from '@sallah/i18n';
import { useLocale } from '@/providers/locale-provider';
import { executeJournaledMutation } from '@/lib/mutation-journal';

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
  selectable: z.boolean(),
  ineligibleReason: z.string().nullable(),
});

export default function Offers() {
  const { locale, t } = useLocale();
  const rowDirection = { flexDirection: logicalFlexDirection(locale) } as const;
  const textDirection = {
    textAlign: logicalTextAlignment(locale),
    writingDirection: logicalWritingDirection(locale),
  } as const;
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
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('AUTH_REQUIRED');
      return executeJournaledMutation({
        userId: userData.user.id,
        operation: 'select_offer',
        entityKey: offerId,
        payload: { offerId },
        execute: async (idempotencyKey, persistedPayload) => {
          const authoritative = z.object({ offerId: z.uuid() }).parse(persistedPayload);
          const { data, error: rpcError } = await supabase.rpc('select_offer', {
            p_offer_id: authoritative.offerId,
            p_idempotency_key: idempotencyKey,
          });
          if (rpcError) throw rpcError;
          return z.string().uuid().parse(data);
        },
      });
    },
    onSuccess: async (jobId) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['customer-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['customer-home-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['jobs'] }),
      ]);
      Alert.alert(t('offerSelectedTitle'), t('offerSelectedBody'));
      router.replace({ pathname: '/jobs', params: { jobId } });
    },
    onError: () => setError(t('offerSelectFailed')),
  });
  return (
    <CustomerScreen testID="customer-offers">
      <View style={styles.header}>
        <Text accessibilityRole="header" style={customerStyles.title}>
          {t('privateOffersTitle')}
        </Text>
        <Text style={customerStyles.bodyMuted}>{t('privateOffersLead')}</Text>
      </View>
      {!requestId ? (
        <Notice live tone="danger">
          {t('missingRequestId')}
        </Notice>
      ) : null}
      {requestId && query.isPending ? <LoadingBlock label={t('loadingOffers')} rows={4} /> : null}
      {query.isError ? (
        <Surface tone="danger">
          <Notice live tone="danger">
            {t('loadOffersFailed')}
          </Notice>
          <ActionButton
            icon="refresh"
            label={t('retry')}
            onPress={() => void query.refetch()}
            variant="secondary"
          />
        </Surface>
      ) : null}
      {query.data?.map((offer) => (
        <Surface key={offer.id} accessibilityLabel={offer.providerName}>
          <View style={[styles.providerHeader, rowDirection]}>
            <View style={styles.providerIcon}>
              <AppIcon color={tokens.colors.primaryStrong} name="customer" size={24} />
            </View>
            <View style={styles.providerSummary}>
              <Text style={[customerStyles.section, textDirection]}>{offer.providerName}</Text>
              <Text style={[customerStyles.caption, textDirection]}>
                {t('offerRatingSummary', {
                  rating: offer.rating.toFixed(1),
                  count: offer.ratingCount,
                  jobs: offer.completedJobs,
                })}
              </Text>
            </View>
          </View>
          <View style={styles.priceSummary}>
            <Text style={[customerStyles.caption, textDirection]}>{t('totalPriceSar')}</Text>
            <Text style={[styles.price, textDirection]}>
              {formatSar(offer.totalAmountMinor, locale)}
            </Text>
            <Text style={[customerStyles.caption, textDirection]}>
              {t('visitFee')}: {formatSar(offer.visitFeeMinor, locale)}
            </Text>
            {offer.materialsEstimateMinor !== null ? (
              <Text style={[customerStyles.caption, textDirection]}>
                {t('materialsEstimate')}: {formatSar(offer.materialsEstimateMinor, locale)}
              </Text>
            ) : null}
          </View>
          <View style={styles.detailGrid}>
            <View style={[styles.detail, rowDirection]}>
              <AppIcon color={tokens.colors.primaryStrong} name="time" size={18} />
              <Text style={[styles.detailText, textDirection]}>
                {t('offerTimingSummary', {
                  arrival: offer.estimatedArrivalMinutes,
                  duration: offer.estimatedDurationMinutes,
                })}
              </Text>
            </View>
            <View style={[styles.detail, rowDirection]}>
              <AppIcon color={tokens.colors.success} name="shield" size={18} />
              <Text style={[styles.detailText, textDirection]}>
                {t('warrantyDaysSummary', { days: offer.warrantyDays })}
              </Text>
            </View>
            <View style={[styles.detail, rowDirection]}>
              <AppIcon color={tokens.colors.accent} name="tools" size={18} />
              <Text style={[styles.detailText, textDirection]}>
                {offer.materialsIncluded ? t('materialsIncluded') : t('materialsNotIncluded')}
              </Text>
            </View>
          </View>
          {offer.note.length > 0 ? (
            <Text style={[styles.note, textDirection]}>{offer.note}</Text>
          ) : null}
          <Text style={[customerStyles.caption, textDirection]}>
            {t('offerValidUntil', {
              date: new Date(offer.expiresAt).toLocaleString(locale === 'ar' ? 'ar-SA' : locale, {
                timeZone: 'Asia/Riyadh',
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
            })}
          </Text>
          {!offer.selectable ? (
            <Notice tone="warning">
              {t(
                offer.ineligibleReason === 'offer_expired'
                  ? 'offerExpired'
                  : offer.ineligibleReason === 'offer_withdrawn'
                    ? 'offerWithdrawn'
                    : 'offerUnavailable',
              )}
            </Notice>
          ) : null}
          <ActionButton
            disabled={selectOffer.isPending || !offer.selectable}
            label={t('selectThisOffer')}
            loading={selectOffer.isPending && selectOffer.variables === offer.id}
            onPress={() => {
              setError('');
              selectOffer.mutate(offer.id);
            }}
          />
        </Surface>
      ))}
      {!query.isPending && !query.isError && query.data?.length === 0 ? (
        <EmptyState body={t('privateOffersLead')} icon="requests" title={t('noActiveOffers')} />
      ) : null}
      {error.length > 0 ? (
        <Notice live tone="danger">
          {error}
        </Notice>
      ) : null}
    </CustomerScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: tokens.spacing.xs },
  providerHeader: { alignItems: 'center', gap: tokens.spacing.sm },
  priceSummary: {
    borderBottomWidth: 1,
    borderBottomColor: tokens.colors.border,
    paddingBottom: tokens.spacing.sm,
    gap: tokens.spacing.xxs,
  },
  providerIcon: {
    alignItems: 'center',
    backgroundColor: tokens.colors.primarySoft,
    borderRadius: tokens.radius.md,
    height: 48,
    justifyContent: 'center',
    width: 48,
  },
  providerSummary: { flex: 1, gap: tokens.spacing.xxs },
  price: { ...tokens.type.title, color: tokens.colors.primaryStrong },
  detailGrid: { gap: tokens.spacing.xs },
  detail: {
    alignItems: 'center',
    backgroundColor: tokens.colors.surfaceMuted,
    borderRadius: tokens.radius.md,
    flexDirection: 'row',
    gap: tokens.spacing.xs,
    minHeight: 44,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xs,
  },
  detailText: { ...tokens.type.caption, color: tokens.colors.ink, flex: 1 },
  note: {
    ...tokens.type.body,
    backgroundColor: tokens.colors.canvas,
    borderRadius: tokens.radius.md,
    color: tokens.colors.ink,
    padding: tokens.spacing.sm,
  },
});
