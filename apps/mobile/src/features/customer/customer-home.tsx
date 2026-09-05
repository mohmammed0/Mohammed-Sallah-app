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
import { useCustomerLocation } from '@/features/location/location-provider';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/providers/locale-provider';

const categorySchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  icon_key: z.string(),
  service_category_translations: z.array(z.object({ name: z.string(), description: z.string() })),
});
const requestSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: z.string(),
  created_at: z.string(),
  timing_mode: z.enum(['asap', 'scheduled', 'flexible']),
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
  const { dir, locale, t } = useLocale();
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
    queryKey: ['customer-home-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_requests')
        .select('id,title,status,created_at,timing_mode')
        .order('created_at', { ascending: false })
        .limit(12);
      if (error) throw error;
      return z.array(requestSchema).parse(data ?? []);
    },
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
        <View style={[customerStyles.between, dir === 'rtl' && styles.rowReverse]}>
          <Text style={styles.heroEyebrow}>{t('appName')}</Text>
          <View style={styles.heroIcon}>
            <AppIcon color={tokens.colors.white} name="tools" size={26} />
          </View>
        </View>
        <Text accessibilityRole="header" style={styles.heroTitle}>
          {t('customerHomeTitle')}
        </Text>
        <Text style={styles.heroLead}>{t('customerHomeLead')}</Text>
        <ActionButton
          icon="plus"
          label={t('newRequest')}
          onPress={() => router.push('/request/new')}
          variant="secondary"
        />
      </View>

      <View style={[customerStyles.wrap, dir === 'rtl' && styles.rowReverse]}>
        <ActionButton
          icon="requests"
          label={t('requests')}
          onPress={() => router.push('/requests')}
          variant="secondary"
          style={styles.shortcut}
        />
        <ActionButton
          icon="messages"
          label={t('messages')}
          onPress={() => router.push('/messages')}
          variant="secondary"
          style={styles.shortcut}
        />
      </View>

      <View style={styles.section}>
        <SectionHeader
          actionLabel={t('seeAll')}
          onAction={() => router.push('/requests')}
          title={t('activeRequest')}
        />
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
        {activeRequest ? (
          <InteractivePressable accessibilityRole="button" onPress={() => router.push('/requests')}>
            <Surface>
              <View style={[customerStyles.between, dir === 'rtl' && styles.rowReverse]}>
                <Text style={styles.requestTitle}>{activeRequest.title}</Text>
                <Text style={styles.statusPill}>
                  {formatStatusLabel(activeRequest.status, locale)}
                </Text>
              </View>
              <Text style={customerStyles.caption}>
                {new Date(activeRequest.created_at).toLocaleString(
                  locale === 'ar' ? 'ar-SA' : locale,
                  { timeZone: 'Asia/Riyadh', dateStyle: 'medium', timeStyle: 'short' },
                )}
              </Text>
            </Surface>
          </InteractivePressable>
        ) : !requests.isPending && !requests.isError ? (
          <EmptyState
            actionLabel={t('createFirstRequest')}
            body={t('noActiveRequestsBody')}
            icon="requests"
            onAction={() => router.push('/request/new')}
            title={t('noActiveRequests')}
          />
        ) : null}
      </View>

      {receivingOffers.length > 0 ? (
        <Surface tone="accent">
          <View style={[customerStyles.between, dir === 'rtl' && styles.rowReverse]}>
            <View style={styles.flex}>
              <Text style={customerStyles.section}>{t('offersWaiting')}</Text>
              <Text style={customerStyles.bodyMuted}>
                {t('newOffersCount', { count: receivingOffers.length })}
              </Text>
            </View>
            <View style={styles.offerBadge}>
              <Text style={styles.offerBadgeText}>{receivingOffers.length}</Text>
            </View>
          </View>
          <ActionButton
            label={t('viewPrivateComparison')}
            onPress={() => router.push('/requests')}
            variant="secondary"
          />
        </Surface>
      ) : null}

      <Field
        icon="search"
        label={t('searchServices')}
        onChangeText={setSearch}
        placeholder={t('searchServicesPlaceholder')}
        returnKeyType="search"
        value={search}
      />

      <View style={styles.section}>
        <SectionHeader title={t('serviceCategories')} />
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
        <View style={[styles.categoryGrid, dir === 'rtl' && styles.rowReverse]}>
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
                style={styles.categoryCard}
              >
                <View style={styles.categoryIcon}>
                  <AppIcon
                    color={tokens.colors.primaryStrong}
                    name={categoryIconName(category.icon_key, category.slug)}
                    size={27}
                  />
                </View>
                <Text style={styles.categoryName}>{translation?.name ?? category.slug}</Text>
                <Text style={customerStyles.caption}>{translation?.description ?? ''}</Text>
              </InteractivePressable>
            );
          })}
        </View>
      </View>

      <Surface tone="muted">
        <View style={[customerStyles.row, dir === 'rtl' && styles.rowReverse]}>
          <View style={styles.aiIcon}>
            <AppIcon color={tokens.colors.primaryStrong} name="sparkles" size={24} />
          </View>
          <View style={styles.flex}>
            <Text style={customerStyles.section}>{t('aiRequestPrompt')}</Text>
            <Text style={customerStyles.bodyMuted}>{t('aiRequestBody')}</Text>
          </View>
        </View>
        <ActionButton
          label={t('describeProblem')}
          onPress={() => router.push('/request/new')}
          variant="secondary"
        />
      </Surface>

      {requests.isSuccess ? (
        <View style={styles.section}>
          <SectionHeader title={t('recentRequests')} />
          {recentRequests.length ? (
            recentRequests.map((request) => (
              <Surface key={request.id}>
                <View style={[customerStyles.between, dir === 'rtl' && styles.rowReverse]}>
                  <Text numberOfLines={1} style={styles.requestTitle}>
                    {request.title}
                  </Text>
                  <Text style={customerStyles.caption}>
                    {formatStatusLabel(request.status, locale)}
                  </Text>
                </View>
              </Surface>
            ))
          ) : (
            <Text style={customerStyles.bodyMuted}>{t('noRecentRequests')}</Text>
          )}
        </View>
      ) : null}

      {catalog.data?.length ? (
        <View style={styles.section}>
          <SectionHeader title={t('recommendedServices')} />
          <View style={[customerStyles.wrap, dir === 'rtl' && styles.rowReverse]}>
            {(catalog.data ?? []).slice(0, 4).map((category) => (
              <InteractivePressable
                key={category.id}
                accessibilityRole="button"
                onPress={() =>
                  router.push({ pathname: '/request/new', params: { category: category.slug } })
                }
                style={[styles.recommendation, dir === 'rtl' && styles.rowReverse]}
              >
                <AppIcon
                  color={tokens.colors.primaryStrong}
                  name={categoryIconName(category.icon_key, category.slug)}
                  size={19}
                />
                <Text style={styles.recommendationText}>
                  {category.service_category_translations[0]?.name ?? category.slug}
                </Text>
              </InteractivePressable>
            ))}
          </View>
        </View>
      ) : null}

      <Surface tone="muted">
        <View style={[customerStyles.row, dir === 'rtl' && styles.rowReverse]}>
          <AppIcon color={tokens.colors.primaryStrong} name="shield" size={24} />
          <View style={styles.flex}>
            <Text style={customerStyles.section}>{t('safetyAndSupport')}</Text>
            <Text style={customerStyles.bodyMuted}>{t('safetyAndSupportBody')}</Text>
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
  rowReverse: { flexDirection: 'row-reverse' },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: tokens.spacing.sm },
  locationButton: {
    flex: 1,
    minHeight: tokens.touchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
  },
  locationIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: tokens.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  locationCopy: { flex: 1 },
  locationValue: { ...tokens.type.label, color: tokens.colors.ink, textAlign: 'auto' },
  hero: {
    borderRadius: tokens.radius.xl,
    backgroundColor: tokens.colors.primaryStrong,
    padding: tokens.spacing.xl,
    gap: tokens.spacing.md,
    overflow: 'hidden',
  },
  heroIcon: {
    width: 46,
    height: 46,
    borderRadius: tokens.radius.md,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
  },
  heroEyebrow: { ...tokens.type.section, color: tokens.colors.white, textAlign: 'auto' },
  heroTitle: { ...tokens.type.display, color: tokens.colors.white, textAlign: 'auto' },
  heroLead: { ...tokens.type.body, color: '#DFF2EE', textAlign: 'auto' },
  shortcut: { flexBasis: 140, flexGrow: 1 },
  section: { gap: tokens.spacing.sm },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
  categoryCard: {
    flexBasis: 140,
    flexGrow: 1,
    minHeight: 150,
    borderRadius: tokens.radius.lg,
    backgroundColor: tokens.colors.surface,
    borderColor: tokens.colors.border,
    borderWidth: 1,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
    ...tokens.shadow.card,
  },
  categoryIcon: {
    width: 50,
    height: 50,
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
  requestTitle: { flex: 1, ...tokens.type.label, color: tokens.colors.ink, textAlign: 'auto' },
  statusPill: {
    ...tokens.type.caption,
    color: tokens.colors.primaryStrong,
    backgroundColor: tokens.colors.primarySoft,
    borderRadius: tokens.radius.pill,
    paddingHorizontal: tokens.spacing.sm,
    paddingVertical: tokens.spacing.xxs,
    overflow: 'hidden',
  },
  offerBadge: {
    minWidth: 42,
    height: 42,
    borderRadius: 21,
    paddingHorizontal: tokens.spacing.sm,
    backgroundColor: tokens.colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  offerBadgeText: { color: tokens.colors.white, fontWeight: '900', fontSize: 18 },
  recommendation: {
    minHeight: 44,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.xs,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
    paddingHorizontal: tokens.spacing.md,
  },
  recommendationText: { ...tokens.type.label, color: tokens.colors.ink },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
});
