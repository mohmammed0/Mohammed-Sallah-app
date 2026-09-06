import { useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';
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
import { logicalRowStyle, logicalTextStyle } from '@/design-system/rtl';
import { supabase } from '@/lib/supabase';
import { formatSar } from '@sallah/i18n';
import { useLocale } from '@/providers/locale-provider';
import { executeJournaledMutation } from '@/lib/mutation-journal';
import { StatusMotion } from '@/design-system/motion';
import { useActiveScreen } from '@/features/connectivity/use-active-screen';
import { useNetworkState } from 'expo-network';
import { isNetworkOnline } from '@/features/connectivity/network-state';

const waitingStatuses = new Set(['published', 'matching', 'receiving_offers']);
const selectedStatuses = new Set([
  'provider_selected',
  'scheduled',
  'en_route',
  'arrived',
  'diagnosing',
  'awaiting_change_order_approval',
  'in_progress',
  'completion_submitted',
  'disputed',
]);
const requestContextSchema = z.object({ id: z.uuid(), status: z.string() }).nullable();

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
  const rowDirection = logicalRowStyle(locale);
  const textDirection = logicalTextStyle(locale);
  const { requestId } = useLocalSearchParams<{ requestId?: string }>();
  const scope = z.uuid().safeParse(requestId);
  const active = useActiveScreen();
  const online = isNetworkOnline(useNetworkState());
  const [error, setError] = useState('');
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['customer-offers', requestId],
    enabled: scope.success && active && online,
    staleTime: 0,
    refetchOnReconnect: 'always',
    refetchInterval: active && online ? 8_000 : false,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      if (!scope.success) throw new Error('INVALID_REQUEST_ROUTE');
      const { data, error: rpcError } = await supabase.rpc('get_customer_offers', {
        p_request_id: scope.data,
      });
      if (rpcError) throw rpcError;
      return z.array(offerSchema).parse(data);
    },
  });
  const requestContext = useQuery({
    queryKey: ['customer-offer-request', requestId],
    enabled: scope.success && active && online,
    staleTime: 0,
    refetchOnReconnect: 'always',
    refetchInterval: active && online ? 8_000 : false,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      if (!scope.success) throw new Error('INVALID_REQUEST_ROUTE');
      const { data, error: contextError } = await supabase
        .from('service_requests')
        .select('id,status')
        .eq('id', scope.data)
        .maybeSingle();
      if (contextError) throw contextError;
      return requestContextSchema.parse(data);
    },
  });
  const refreshingAvailable =
    online && query.fetchStatus !== 'paused' && requestContext.fetchStatus !== 'paused';
  const waiting = Boolean(
    refreshingAvailable &&
    requestContext.isSuccess &&
    !requestContext.isError &&
    requestContext.data &&
    waitingStatuses.has(requestContext.data.status),
  );
  const refresh = () => {
    void query.refetch();
    void requestContext.refetch();
  };
  const selected = selectedStatuses.has(requestContext.data?.status ?? '');
  const closed = ['cancelled', 'completed'].includes(requestContext.data?.status ?? '');
  const availableOfferCount = query.data?.filter((offer) => offer.selectable).length ?? 0;
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
      {!scope.success ? (
        <Notice live tone="danger">
          {t('missingRequestId')}
        </Notice>
      ) : null}
      {scope.success && refreshingAvailable && (query.isPending || requestContext.isPending) ? (
        <LoadingBlock label={t('loadingOffers')} rows={4} />
      ) : null}
      {query.isError ? (
        <Surface tone="danger">
          <Notice live tone="danger">
            {t('loadOffersFailed')}
          </Notice>
          <ActionButton icon="refresh" label={t('retry')} onPress={refresh} variant="secondary" />
        </Surface>
      ) : null}
      {scope.success && (requestContext.isError || !refreshingAvailable) ? (
        <Notice live tone="warning">
          {t('waitingStatusUnavailable')}
        </Notice>
      ) : null}
      {scope.success &&
      !query.isPending &&
      !query.isError &&
      waiting &&
      availableOfferCount === 0 ? (
        <Surface tone="accent">
          <StatusMotion
            active={active}
            description={t('requestWaitingBody')}
            label={t('requestWaitingTitle')}
            testID="request-waiting-motion"
            variant="waiting"
          />
          <View style={[styles.detail, rowDirection]}>
            <AppIcon color={tokens.colors.primaryStrong} name="shield" size={20} />
            <Text style={[styles.detailText, textDirection]}>{t('privateOffersLead')}</Text>
          </View>
          <Text style={[customerStyles.caption, textDirection]}>{t('waitingRefreshHint')}</Text>
        </Surface>
      ) : null}
      {scope.success && waiting && availableOfferCount > 0 && !query.isError ? (
        <Surface tone="success">
          <StatusMotion
            active={active}
            description={t('offersReadyBody', { count: availableOfferCount })}
            label={t('offersReadyTitle')}
            layout="inline"
            variant="success"
          />
        </Surface>
      ) : null}
      {selectOffer.isPending ? (
        <StatusMotion
          active={active}
          description={t('offerSelectingBody')}
          label={t('offerSelectingTitle')}
          layout="inline"
          variant="sending"
        />
      ) : null}
      {scope.success ? (
        <ActionButton
          icon="refresh"
          label={t('refreshOffers')}
          disabled={!refreshingAvailable}
          loading={query.isFetching || requestContext.isFetching}
          onPress={refresh}
          variant="secondary"
        />
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
            disabled={
              selectOffer.isPending ||
              !offer.selectable ||
              !waiting ||
              query.isError ||
              query.isFetching ||
              requestContext.isFetching
            }
            label={t('selectThisOffer')}
            loading={selectOffer.isPending && selectOffer.variables === offer.id}
            onPress={() => {
              setError('');
              selectOffer.mutate(offer.id);
            }}
          />
        </Surface>
      ))}
      {scope.success &&
      refreshingAvailable &&
      !requestContext.isPending &&
      !requestContext.isError &&
      !waiting ? (
        <EmptyState
          actionLabel={t(selected ? 'serviceTrackingTitle' : 'viewAllRequests')}
          body={t(
            selected
              ? 'serviceBookedBody'
              : closed
                ? 'requestClosedBody'
                : 'requestStatusUnknownBody',
          )}
          icon="requests"
          onAction={() =>
            selected && scope.success
              ? router.replace({ pathname: '/jobs', params: { requestId: scope.data } })
              : router.replace('/customer-requests')
          }
          title={t(
            selected
              ? 'serviceTrackingTitle'
              : closed
                ? 'requestClosedTitle'
                : 'requestStatusUnknownTitle',
          )}
        />
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
