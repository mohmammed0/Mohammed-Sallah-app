import { StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { formatStatusLabel } from '@sallah/i18n';
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
import { StatusPill } from '@/design-system/customer-components';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/providers/locale-provider';
import { PushPermissionCard } from '@/features/notifications/push-permission-card';
import { notificationEventLabelKey } from '@/features/notifications/notification-label';

const notificationSchema = z.object({
  id: z.uuid(),
  event_type: z.string(),
  status: z.string(),
  payload: z.record(z.string(), z.unknown()),
  created_at: z.string(),
});

export default function Notifications() {
  const { locale, t } = useLocale();
  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notification_outbox')
        .select('id,event_type,status,payload,created_at')
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return z.array(notificationSchema).parse(data ?? []);
    },
  });
  return (
    <CustomerScreen testID="customer-notifications">
      <View style={customerStyles.between}>
        <View style={styles.header}>
          <Text accessibilityRole="header" style={customerStyles.display}>
            {t('notifications')}
          </Text>
          <Text style={customerStyles.bodyMuted}>{t('notificationPreferences')}</Text>
        </View>
        <ActionButton
          accessibilityLabel={t('retry')}
          disabled={query.isFetching}
          icon="refresh"
          label={t('retry')}
          onPress={() => void query.refetch()}
          variant="ghost"
        />
      </View>
      <PushPermissionCard />
      {query.isLoading ? <LoadingBlock label={t('loading')} rows={4} /> : null}
      {query.isError ? (
        <Surface tone="danger">
          <Notice live tone="danger">
            {t('notificationsLoadFailed')}
          </Notice>
          <ActionButton
            icon="refresh"
            label={t('retry')}
            onPress={() => void query.refetch()}
            variant="secondary"
          />
        </Surface>
      ) : null}
      {query.data?.map((item) => (
        <Surface key={item.id}>
          <View style={customerStyles.between}>
            <View style={styles.notificationIcon}>
              <AppIcon color={tokens.colors.primaryStrong} name="bell" size={20} />
            </View>
            <View style={styles.notificationCopy}>
              <Text style={customerStyles.section}>
                {t(notificationEventLabelKey(item.event_type))}
              </Text>
              <Text style={customerStyles.caption}>
                {new Date(item.created_at).toLocaleString(locale === 'ar' ? 'ar-SA' : locale)}
              </Text>
            </View>
            <StatusPill
              label={formatStatusLabel(item.status, locale)}
              tone={
                item.status === 'sent' ? 'success' : item.status === 'failed' ? 'danger' : 'active'
              }
            />
          </View>
        </Surface>
      ))}
      {!query.isLoading && !query.isError && query.data?.length === 0 ? (
        <EmptyState body={t('notificationPreferences')} icon="bell" title={t('noNotifications')} />
      ) : null}
    </CustomerScreen>
  );
}

const styles = StyleSheet.create({
  header: { flex: 1, gap: tokens.spacing.xxs },
  notificationIcon: {
    alignItems: 'center',
    backgroundColor: tokens.colors.primarySoft,
    borderRadius: tokens.radius.md,
    height: 44,
    justifyContent: 'center',
    width: 44,
  },
  notificationCopy: { flex: 1, gap: tokens.spacing.xxs },
});
