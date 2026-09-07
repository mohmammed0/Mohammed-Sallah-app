import { useMemo, useState } from 'react';
import { router } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { StyleSheet, Text, View } from 'react-native';
import { z } from 'zod';
import { formatStatusLabel } from '@sallah/i18n';
import {
  ActionButton,
  CustomerScreen,
  EmptyState,
  Field,
  InteractivePressable,
  LoadingBlock,
  Notice,
  SectionHeader,
  Surface,
  customerStyles,
} from '@/design-system/primitives';
import { LocationHeader } from '@/design-system/customer-components';
import { AppIcon, categoryIconName } from '@/design-system/icon';
import { customerTokens as tokens } from '@/design-system/tokens';
import {
  logicalChevron,
  logicalRowStyle,
  logicalTextStyle,
  logicalWritingDirection,
} from '@/design-system/rtl';
import { useCustomerLocation } from '@/features/location/location-provider';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/providers/locale-provider';
import { useSessionContext } from '@/providers/session-provider';
import { useActiveScreen } from '@/features/connectivity/use-active-screen';
import { listCustomerRequests } from './customer-request-service';

const categorySchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  icon_key: z.string(),
  service_category_translations: z.array(z.object({ name: z.string(), description: z.string() })),
});
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

export function CustomerHome() {
  const active = useActiveScreen();
  const { locale, t } = useLocale();
  const { session } = useSessionContext();
  const customerId = session?.user.id ?? null;
  const textDirection = logicalTextStyle(locale);
  const { activeLocation: defaultAddress } = useCustomerLocation();
  const [search, setSearch] = useState('');
  const catalog = useQuery({
    queryKey: ['customer-home-catalog', locale],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_categories')
        .select('id,slug,icon_key,service_category_translations(name,description)')
        .eq('service_category_translations.locale', locale)
        .eq('enabled', true)
        .order('sort_order');
      if (error) throw error;
      return z.array(categorySchema).parse(data ?? []);
    },
  });
  const requests = useQuery({
    queryKey: ['customer-home-requests', customerId],
    queryFn: () => listCustomerRequests(customerId, 12),
    enabled: active && Boolean(customerId),
    refetchInterval: active ? 8_000 : false,
    refetchIntervalInBackground: false,
  });
  const notifications = useQuery({
    queryKey: ['customer-notification-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('notification_outbox')
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
  });
  const filteredCategories = useMemo(() => {
    const normalized = search.trim().toLocaleLowerCase(locale);
    if (!normalized) return catalog.data ?? [];
    return (catalog.data ?? []).filter((category) => {
      const translation = category.service_category_translations[0];
      return `${translation?.name ?? ''} ${translation?.description ?? ''} ${category.slug}`
        .toLocaleLowerCase(locale)
        .includes(normalized);
    });
  }, [catalog.data, locale, search]);
  const activeRequest = requests.data?.find((request) => activeStatuses.has(request.status));
  const receivingOffers =
    requests.data?.filter((request) => request.status === 'receiving_offers') ?? [];
  const recentRequests =
    requests.data?.filter((request) => !activeStatuses.has(request.status)).slice(0, 3) ?? [];
  return (
    <CustomerScreen testID="customer-home">
      <LocationHeader
        address={defaultAddress?.formattedAddress ?? t('locationNotSelected')}
        changeLabel={t('changeLocation')}
        label={defaultAddress?.label ?? t('currentLocation')}
        notificationLabel={t('notificationAccessibility')}
        onNotifications={() => router.push('/notifications')}
        onPress={() => router.push('/locations')}
        {...(notifications.data === undefined ? {} : { unreadCount: notifications.data })}
      />

      <View style={styles.hero}>
        <Text accessibilityRole="header" style={[styles.heroTitle, textDirection]}>
          {t('customerHomeTitle')}
        </Text>
        <Text style={[styles.heroLead, textDirection]}>{t('customerHomeLead')}</Text>
        <ActionButton
          icon="plus"
          label={t('newRequest')}
          onPress={() => router.push('/request/new')}
          variant="secondary"
        />
      </View>

      {activeRequest ? (
        <View style={styles.section}>
          <SectionHeader
            actionLabel={t('seeAll')}
            onAction={() => router.push('/requests')}
            title={t('activeRequest')}
          />
          <Surface>
            <InteractivePressable
              accessibilityLabel={`${activeRequest.title}, ${formatStatusLabel(activeRequest.status, locale)}`}
              accessibilityRole="button"
              onPress={() => router.push('/requests')}
              style={[styles.requestLink, logicalRowStyle(locale)]}
            >
              <View style={styles.flex}>
                <Text style={[styles.requestTitle, textDirection]}>{activeRequest.title}</Text>
                <Text style={[styles.requestStatus, textDirection]}>
                  {formatStatusLabel(activeRequest.status, locale)}
                </Text>
                <Text style={[customerStyles.caption, textDirection]}>
                  {new Date(activeRequest.created_at).toLocaleString(
                    locale === 'ar' ? 'ar-SA' : locale,
                    { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' },
                  )}
                </Text>
              </View>
              <AppIcon
                color={tokens.colors.primaryStrong}
                name={logicalChevron(locale, 'forward')}
                size={20}
              />
            </InteractivePressable>
            {receivingOffers.length > 0 ? (
              <View style={styles.offersSummary}>
                <Text style={[customerStyles.bodyMuted, textDirection]}>
                  {t('newOffersCount', { count: receivingOffers.length })}
                </Text>
                <ActionButton
                  icon="requests"
                  label={t('viewPrivateComparison')}
                  onPress={() => router.push('/requests')}
                  variant="secondary"
                />
              </View>
            ) : null}
          </Surface>
        </View>
      ) : null}

      <View style={styles.section}>
        <SectionHeader title={t('serviceCategories')} />
        <Field
          icon="search"
          label={t('searchServices')}
          onChangeText={setSearch}
          placeholder={t('searchServicesPlaceholder')}
          returnKeyType="search"
          value={search}
        />
        {search.trim() ? (
          <ActionButton
            testID="home-clear-search"
            icon="close"
            label={t('homeClearSearch')}
            onPress={() => setSearch('')}
            variant="ghost"
          />
        ) : null}
        {catalog.isPending ? <LoadingBlock label={t('loading')} rows={4} /> : null}
        {catalog.isError ? (
          <Surface>
            <Notice live tone="danger">
              {t('catalogLoadFailed')}
            </Notice>
            <ActionButton
              testID="home-retry-catalog"
              icon="refresh"
              label={t('retry')}
              loading={catalog.isFetching}
              onPress={() => void catalog.refetch()}
              variant="secondary"
            />
          </Surface>
        ) : null}
        {catalog.isSuccess && filteredCategories.length === 0 ? (
          <EmptyState
            icon={catalog.data.length ? 'search' : 'tools'}
            title={t(catalog.data.length ? 'homeSearchEmptyTitle' : 'homeCatalogEmptyTitle')}
            body={t(catalog.data.length ? 'homeSearchEmptyBody' : 'homeCatalogEmptyBody')}
            {...(catalog.data.length
              ? {}
              : { actionLabel: t('openHelp'), onAction: () => router.push('/support') })}
          />
        ) : null}
        <View style={[styles.categoryGrid, logicalRowStyle(locale)]}>
          {filteredCategories.map((category) => {
            const translation = category.service_category_translations[0];
            return (
              <InteractivePressable
                key={category.id}
                testID={`home-category-${category.slug}`}
                accessibilityHint={t('browseCategory')}
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: '/request/new',
                    params: { category: category.slug },
                  })
                }
                style={[styles.categoryCard, { direction: logicalWritingDirection(locale) }]}
              >
                <View style={styles.categoryIcon}>
                  <AppIcon
                    color={tokens.colors.primaryStrong}
                    name={categoryIconName(category.icon_key, category.slug)}
                    size={24}
                  />
                </View>
                <Text style={[styles.categoryName, textDirection]}>
                  {translation?.name ?? category.slug}
                </Text>
                <Text style={[customerStyles.caption, textDirection]}>
                  {translation?.description ?? ''}
                </Text>
              </InteractivePressable>
            );
          })}
        </View>
      </View>

      <InteractivePressable
        accessibilityLabel={t('describeProblem')}
        accessibilityHint={t('aiRequestBody')}
        accessibilityRole="button"
        onPress={() => router.push('/request/new')}
      >
        <Surface tone="muted" style={[styles.supportRow, logicalRowStyle(locale)]}>
          <View style={styles.aiIcon}>
            <AppIcon color={tokens.colors.primaryStrong} name="sparkles" size={24} />
          </View>
          <View style={styles.flex}>
            <Text style={[customerStyles.section, textDirection]}>{t('aiRequestPrompt')}</Text>
            <Text style={[customerStyles.caption, textDirection]}>{t('aiRequestBody')}</Text>
          </View>
          <AppIcon
            color={tokens.colors.primaryStrong}
            name={logicalChevron(locale, 'forward')}
            size={20}
          />
        </Surface>
      </InteractivePressable>

      {requests.isPending ? <LoadingBlock label={t('loadingRequests')} /> : null}
      {requests.isError ? (
        <Surface>
          <Notice live tone="danger">
            {t('loadRequestsFailed')}
          </Notice>
          <ActionButton
            testID="home-retry-requests"
            icon="refresh"
            label={t('retry')}
            loading={requests.isFetching}
            onPress={() => void requests.refetch()}
            variant="secondary"
          />
        </Surface>
      ) : null}
      {requests.isSuccess && !activeRequest ? (
        <Surface tone="muted" style={[styles.supportRow, logicalRowStyle(locale)]}>
          <AppIcon color={tokens.colors.textMuted} name="requests" size={24} />
          <View style={styles.flex}>
            <Text style={[styles.requestTitle, textDirection]}>{t('noActiveRequests')}</Text>
            <Text style={[customerStyles.caption, textDirection]}>{t('noActiveRequestsBody')}</Text>
          </View>
        </Surface>
      ) : null}

      {requests.isSuccess && recentRequests.length > 0 ? (
        <View style={styles.section}>
          <SectionHeader
            title={t('recentRequests')}
            actionLabel={t('seeAll')}
            onAction={() => router.push('/requests')}
          />
          {recentRequests.map((request) => (
            <Surface key={request.id}>
              <View style={styles.section}>
                <Text style={[styles.requestTitle, textDirection]}>{request.title}</Text>
                <Text style={[customerStyles.caption, textDirection]}>
                  {formatStatusLabel(request.status, locale)}
                </Text>
              </View>
            </Surface>
          ))}
        </View>
      ) : null}

      <Surface tone="muted">
        <View style={[customerStyles.row, logicalRowStyle(locale)]}>
          <AppIcon color={tokens.colors.primaryStrong} name="shield" size={24} />
          <View style={styles.flex}>
            <Text style={[customerStyles.section, textDirection]}>{t('safetyAndSupport')}</Text>
            <Text style={[customerStyles.bodyMuted, textDirection]}>
              {t('safetyAndSupportBody')}
            </Text>
          </View>
        </View>
        <ActionButton
          label={t('openHelp')}
          onPress={() => router.push('/support')}
          variant="ghost"
        />
      </Surface>
    </CustomerScreen>
  );
}

const styles = StyleSheet.create({
  hero: {
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.colors.primaryStrong,
    padding: tokens.spacing.lg,
    gap: tokens.spacing.sm,
  },
  heroTitle: { ...tokens.type.title, color: tokens.colors.white, textAlign: 'auto' },
  heroLead: { ...tokens.type.body, color: '#DFF2EE', textAlign: 'auto' },
  section: { gap: tokens.spacing.sm },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
  categoryCard: {
    flexBasis: 140,
    flexGrow: 1,
    minHeight: 128,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.colors.surface,
    borderColor: tokens.colors.border,
    borderWidth: 1,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
  },
  categoryIcon: {
    width: 40,
    height: 40,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.primarySoft,
  },
  categoryName: { ...tokens.type.label, color: tokens.colors.ink, textAlign: 'auto' },
  aiIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.surface,
  },
  flex: { flex: 1, gap: 3 },
  requestTitle: { ...tokens.type.label, color: tokens.colors.ink, textAlign: 'auto' },
  requestStatus: {
    ...tokens.type.caption,
    color: tokens.colors.primaryStrong,
    textAlign: 'auto',
  },
  offersSummary: {
    borderTopWidth: 1,
    borderTopColor: tokens.colors.border,
    paddingTop: tokens.spacing.sm,
    gap: tokens.spacing.sm,
  },
  requestLink: {
    minHeight: tokens.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  supportRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
});
