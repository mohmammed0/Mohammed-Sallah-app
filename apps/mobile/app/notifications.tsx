import { RefreshControl, ScrollView, Text } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { formatStatusLabel } from '@sallah/i18n';
import { Button, Card, LoadingSkeleton, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/providers/locale-provider';
import { PushPermissionCard } from '@/features/notifications/push-permission-card';

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
    <ScrollView
      refreshControl={
        <RefreshControl refreshing={query.isFetching} onRefresh={() => void query.refetch()} />
      }
      contentContainerStyle={{ flexGrow: 1 }}
    >
      <Screen>
        <Text style={styles.title}>{t('notifications')}</Text>
        <PushPermissionCard />
        {query.isLoading && <LoadingSkeleton label={t('loading')} />}
        {query.isError && (
          <Card>
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {t('notificationsLoadFailed')}
            </Text>
            <Button kind="secondary" label={t('retry')} onPress={() => void query.refetch()} />
          </Card>
        )}
        {query.data?.map((item) => (
          <Card key={item.id}>
            <Text style={styles.badge}>{item.event_type}</Text>
            <Text style={styles.lead}>{new Date(item.created_at).toLocaleString()}</Text>
            <Text style={styles.lead}>{formatStatusLabel(item.status, locale)}</Text>
          </Card>
        ))}
        {query.data?.length === 0 && <Text style={styles.lead}>{t('noNotifications')}</Text>}
      </Screen>
    </ScrollView>
  );
}
