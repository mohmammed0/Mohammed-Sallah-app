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
  Field,
  IconButton,
  LoadingBlock,
  Notice,
  SectionHeader,
  Surface,
  customerStyles,
} from '@/design-system/primitives';
import { AppIcon, categoryIconName } from '@/design-system/icon';
import { customerTokens as tokens } from '@/design-system/tokens';
import { useCustomerLocation } from '@/features/location/location-provider';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/providers/locale-provider';

const categorySchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  icon_key: z.string(),
  service_category_translations: z.array(
    z.object({ name: z.string(), description: z.string() }),
  ),
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
  const { locale, t } = useLocale();
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
      if (error) return 0;
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
  const receivingOffers = requests.data?.filter((request) => request.status === 'receiving_offers') ?? [];
  const recentRequests =
    requests.data?.filter((request) => !activeStatuses.has(request.status)).slice(0, 3) ?? [];
  return (
    <CustomerScreen testID="customer-home">
      <View style={styles.topbar}>
        <Pressable
          accessibilityLabel={t('changeLocation')}
          accessibilityRole="button"
          onPress={() => router.push('/locations')}
          style={styles.locationButton}
        >
          <View style={styles.locationIcon}>
            <AppIcon color={tokens.colors.primaryStrong} name="location" size={20} />
          </View>
          <View style={styles.locationCopy}>
            <Text style={customerStyles.caption}>{t('currentLocation')}</Text>
            <Text numberOfLines={1} style={styles.locationValue}>
              {defaultAddress?.label ?? t('locationNotSelected')}
            </Text>
            {defaultAddress?.formattedAddress ? (
              <Text numberOfLines={1} style={customerStyles.caption}>
                {defaultAddress.formattedAddress}
              </Text>
            ) : null}
          </View>
          <AppIcon color={tokens.colors.textMuted} name="chevron-forward" size={18} />
        </Pressable>
        <IconButton
          {...(notifications.data === undefined ? {} : { badge: notifications.data })}
          icon="bell"
          label={t('notificationAccessibility')}
          onPress={() => router.push('/notifications')}
        />
      </View>

      <View style={styles.hero}>
        <View style={styles.heroIcon}>
          <AppIcon color={tokens.colors.primaryStrong} name="sparkles" size={28} />
        </View>
        <Text accessibilityRole="header" style={customerStyles.display}>
          {t('customerHomeTitle')}
        </Text>
        <Text style={customerStyles.bodyMuted}>{t('customerHomeLead')}</Text>
        <ActionButton
          icon="plus"
          label={t('newRequest')}
          onPress={() => router.push('/request/new')}
        />
      </View>

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
        {catalog.isPending ? <LoadingBlock label={t('loading')} rows={4} /> : null}
        {catalog.isError ? (
          <Notice live tone="danger">
            {t('catalogLoadFailed')}
          </Notice>
        ) : null}
        <View style={styles.categoryGrid}>
          {filteredCategories.map((category) => {
            const translation = category.service_category_translations[0];
            return (
              <Pressable
                key={category.id}
                accessibilityHint={t('browseCategory')}
                accessibilityRole="button"
                onPress={() =>
                  router.push({
                    pathname: '/request/new',
                    params: { category: category.slug },
                  })
                }
                style={({ pressed }) => [styles.categoryCard, pressed && styles.pressed]}
              >
                <View style={styles.categoryIcon}>
                  <AppIcon
                    color={tokens.colors.primaryStrong}
                    name={categoryIconName(category.icon_key, category.slug)}
                    size={27}
                  />
                </View>
                <Text numberOfLines={2} style={styles.categoryName}>
                  {translation?.name ?? category.slug}
                </Text>
                <Text numberOfLines={2} style={customerStyles.caption}>
                  {translation?.description ?? ''}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>

      <Surface tone="muted">
        <View style={customerStyles.row}>
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

      <View style={styles.section}>
        <SectionHeader
          actionLabel={t('seeAll')}
          onAction={() => router.push('/requests')}
          title={t('activeRequest')}
        />
        {requests.isPending ? <LoadingBlock label={t('loadingRequests')} /> : null}
        {requests.isError ? (
          <Notice live tone="danger">
            {t('loadRequestsFailed')}
          </Notice>
        ) : null}
        {activeRequest ? (
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/requests')}
            style={({ pressed }) => pressed && styles.pressed}
          >
            <Surface>
              <View style={customerStyles.between}>
                <Text style={styles.requestTitle}>{activeRequest.title}</Text>
                <Text style={styles.statusPill}>
                  {formatStatusLabel(activeRequest.status, locale)}
                </Text>
              </View>
              <Text style={customerStyles.caption}>
                {new Date(activeRequest.created_at).toLocaleString(
                  locale === 'ar' ? 'ar-SA' : locale,
                )}
              </Text>
            </Surface>
          </Pressable>
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
          <View style={customerStyles.between}>
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

      <View style={styles.section}>
        <SectionHeader title={t('recentRequests')} />
        {recentRequests.length ? (
          recentRequests.map((request) => (
            <Surface key={request.id}>
              <View style={customerStyles.between}>
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

      <View style={styles.section}>
        <SectionHeader title={t('recommendedServices')} />
        <View style={customerStyles.wrap}>
          {(catalog.data ?? []).slice(0, 4).map((category) => (
            <Pressable
              key={category.id}
              accessibilityRole="button"
              onPress={() =>
                router.push({ pathname: '/request/new', params: { category: category.slug } })
              }
              style={styles.recommendation}
            >
              <AppIcon
                color={tokens.colors.primaryStrong}
                name={categoryIconName(category.icon_key, category.slug)}
                size={19}
              />
              <Text style={styles.recommendationText}>
                {category.service_category_translations[0]?.name ?? category.slug}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>

      <Surface tone="muted">
        <View style={customerStyles.row}>
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
  locationValue: { ...tokens.type.label, color: tokens.colors.ink, textAlign: 'left' },
  hero: {
    borderRadius: tokens.radius.xl,
    backgroundColor: tokens.colors.primarySoft,
    padding: tokens.spacing.xl,
    gap: tokens.spacing.sm,
    overflow: 'hidden',
  },
  heroIcon: {
    width: 54,
    height: 54,
    borderRadius: 27,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.surface,
  },
  section: { gap: tokens.spacing.sm },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
  categoryCard: {
    width: '48%',
    minHeight: 158,
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
  categoryName: { ...tokens.type.label, color: tokens.colors.ink, textAlign: 'left' },
  aiIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.surface,
  },
  flex: { flex: 1, gap: 3 },
  requestTitle: { flex: 1, ...tokens.type.label, color: tokens.colors.ink, textAlign: 'left' },
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
