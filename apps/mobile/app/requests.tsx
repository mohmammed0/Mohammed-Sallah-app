import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';
import { formatStatusLabel } from '@sallah/i18n';
import {
  ActionButton,
  CustomerScreen,
  EmptyState,
  InteractivePressable,
  LoadingBlock,
  Notice,
  Pill,
  Surface,
  customerStyles,
} from '@/design-system/primitives';
import { AppIcon } from '@/design-system/icon';
import { logicalChevron, logicalRowStyle, logicalTextStyle } from '@/design-system/rtl';
import { customerTokens as tokens } from '@/design-system/tokens';
import { listCustomerRequests } from '@/features/customer/customer-request-service';
import { useLocale } from '@/providers/locale-provider';
import { useSessionContext } from '@/providers/session-provider';
import { useActiveScreen } from '@/features/connectivity/use-active-screen';

type Filter = 'all' | 'active' | 'completed';
const activeStatuses = new Set([
  'published',
  'matching',
  'receiving_offers',
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

export default function Requests() {
  const active = useActiveScreen();
  const { locale, t } = useLocale();
  const { session } = useSessionContext();
  const customerId = session?.user.id ?? null;
  const [filter, setFilter] = useState<Filter>('all');
  const query = useQuery({
    queryKey: ['customer-requests', customerId],
    queryFn: () => listCustomerRequests(customerId, 50),
    enabled: active && Boolean(customerId),
    refetchInterval: active ? 8_000 : false,
    refetchIntervalInBackground: false,
  });
  const visible = useMemo(
    () =>
      (query.data ?? []).filter((request) =>
        filter === 'all'
          ? true
          : filter === 'active'
            ? activeStatuses.has(request.status)
            : request.status === 'completed' || request.status === 'cancelled',
      ),
    [filter, query.data],
  );
  return (
    <CustomerScreen testID="customer-requests">
      <View style={styles.header}>
        <Text accessibilityRole="header" style={[customerStyles.display, logicalTextStyle(locale)]}>
          {t('requestsAndOffers')}
        </Text>
        <Text style={[customerStyles.bodyMuted, logicalTextStyle(locale)]}>
          {t('requestsPrivacyNotice')}
        </Text>
      </View>
      <View style={customerStyles.wrap}>
        <Pill label={t('seeAll')} onPress={() => setFilter('all')} selected={filter === 'all'} />
        <Pill
          label={t('activeRequest')}
          onPress={() => setFilter('active')}
          selected={filter === 'active'}
        />
        <Pill
          label={formatStatusLabel('completed', locale)}
          onPress={() => setFilter('completed')}
          selected={filter === 'completed'}
        />
      </View>
      {query.isPending ? <LoadingBlock label={t('loadingRequests')} rows={5} /> : null}
      {query.isError ? (
        <Surface tone="danger">
          <Notice live tone="danger">
            {t('loadRequestsFailed')}
          </Notice>
          <ActionButton
            icon="refresh"
            label={t('retry')}
            onPress={() => void query.refetch()}
            variant="secondary"
          />
        </Surface>
      ) : null}
      {visible.map((request) => (
        <InteractivePressable
          key={request.id}
          accessibilityRole="button"
          onPress={() => {
            if (['published', 'matching', 'receiving_offers'].includes(request.status)) {
              router.push({ pathname: '/offers', params: { requestId: request.id } });
            } else {
              router.push({ pathname: '/jobs', params: { requestId: request.id } });
            }
          }}
        >
          <Surface>
            <View style={[customerStyles.between, logicalRowStyle(locale)]}>
              <View style={styles.icon}>
                <AppIcon color={tokens.colors.primaryStrong} name="requests" size={22} />
              </View>
              <View style={styles.flex}>
                <Text style={[customerStyles.section, logicalTextStyle(locale)]}>
                  {request.title}
                </Text>
                <Text style={[customerStyles.caption, logicalTextStyle(locale)]}>
                  {new Date(request.created_at).toLocaleString(locale === 'ar' ? 'ar-SA' : locale, {
                    timeZone: 'Asia/Riyadh',
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </Text>
              </View>
              <AppIcon
                color={tokens.colors.textMuted}
                name={logicalChevron(locale, 'forward')}
                size={19}
              />
            </View>
            <View style={customerStyles.wrap}>
              <Text style={[styles.status, logicalTextStyle(locale)]}>
                {formatStatusLabel(request.status, locale)}
              </Text>
              <Text style={[styles.meta, logicalTextStyle(locale)]}>
                {request.timing_mode === 'flexible'
                  ? t('timingFlexible')
                  : request.timing_mode === 'scheduled'
                    ? t('schedule')
                    : t('timingAsap')}
              </Text>
            </View>
            {request.status === 'receiving_offers' ? (
              <Text style={[styles.linkLabel, logicalTextStyle(locale)]}>
                {t('viewPrivateComparison')}
              </Text>
            ) : null}
          </Surface>
        </InteractivePressable>
      ))}
      {!query.isPending && !query.isError && visible.length === 0 ? (
        <EmptyState
          actionLabel={t('createFirstRequest')}
          body={t('noActiveRequestsBody')}
          icon="requests"
          onAction={() => router.push('/request/new')}
          title={t('noRequests')}
        />
      ) : null}
    </CustomerScreen>
  );
}

const styles = StyleSheet.create({
  header: { gap: tokens.spacing.xs },
  flex: { flex: 1, gap: tokens.spacing.xxs },
  icon: {
    width: 44,
    height: 44,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.primarySoft,
  },
  status: {
    ...tokens.type.caption,
    color: tokens.colors.primaryStrong,
    backgroundColor: tokens.colors.primarySoft,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xxs,
    overflow: 'hidden',
  },
  meta: {
    ...tokens.type.caption,
    color: tokens.colors.textMuted,
    backgroundColor: tokens.colors.surfaceMuted,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xxs,
    overflow: 'hidden',
  },
  linkLabel: { ...tokens.type.label, color: tokens.colors.primaryStrong, textAlign: 'auto' },
});
