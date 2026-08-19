import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { formatStatusLabel } from '@sallah/i18n';
import {
  ActionButton,
  CustomerScreen,
  EmptyState,
  LoadingBlock,
  Notice,
  Pill,
  Surface,
  customerStyles,
} from '@/design-system/primitives';
import { AppIcon } from '@/design-system/icon';
import { customerTokens as tokens } from '@/design-system/tokens';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/providers/locale-provider';

const requestSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: z.string(),
  version: z.number().int(),
  created_at: z.string(),
  timing_mode: z.enum(['asap', 'scheduled', 'flexible']),
});
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
  const { locale, t } = useLocale();
  const [filter, setFilter] = useState<Filter>('all');
  const query = useQuery({
    queryKey: ['customer-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_requests')
        .select('id,title,status,version,created_at,timing_mode')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return z.array(requestSchema).parse(data ?? []);
    },
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
        <Text accessibilityRole="header" style={customerStyles.display}>
          {t('requestsAndOffers')}
        </Text>
        <Text style={customerStyles.bodyMuted}>{t('requestsPrivacyNotice')}</Text>
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
        <Pressable
          key={request.id}
          accessibilityRole="button"
          onPress={() => {
            if (request.status === 'receiving_offers') {
              router.push({ pathname: '/offers', params: { requestId: request.id } });
            }
          }}
          style={({ pressed }) => pressed && styles.pressed}
        >
          <Surface>
            <View style={customerStyles.between}>
              <View style={styles.icon}>
                <AppIcon color={tokens.colors.primaryStrong} name="requests" size={22} />
              </View>
              <View style={styles.flex}>
                <Text style={customerStyles.section}>{request.title}</Text>
                <Text style={customerStyles.caption}>
                  {new Date(request.created_at).toLocaleString(
                    locale === 'ar' ? 'ar-SA' : locale,
                  )}
                </Text>
              </View>
              <AppIcon color={tokens.colors.textMuted} name="chevron-forward" size={19} />
            </View>
            <View style={customerStyles.wrap}>
              <Text style={styles.status}>{formatStatusLabel(request.status, locale)}</Text>
              <Text style={styles.meta}>
                {request.timing_mode === 'flexible'
                  ? t('timingFlexible')
                  : request.timing_mode === 'scheduled'
                    ? t('schedule')
                    : t('timingAsap')}
              </Text>
              <Text style={styles.meta}>{t('versionSummary', { version: request.version })}</Text>
            </View>
            {request.status === 'receiving_offers' ? (
              <ActionButton
                label={t('viewPrivateComparison')}
                onPress={() =>
                  router.push({ pathname: '/offers', params: { requestId: request.id } })
                }
              />
            ) : null}
          </Surface>
        </Pressable>
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
  pressed: { opacity: 0.72 },
});
