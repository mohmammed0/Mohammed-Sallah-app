import { Link } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ScrollView, Text } from 'react-native';
import { z } from 'zod';
import { Button, Card, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/providers/locale-provider';

const requestSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: z.string(),
  version: z.number().int(),
  created_at: z.string(),
});

export default function Requests() {
  const { locale, t } = useLocale();
  const query = useQuery({
    queryKey: ['customer-requests'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('service_requests')
        .select('id,title,status,version,created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return z.array(requestSchema).parse(data ?? []);
    },
  });
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Screen>
        <Text style={styles.title}>{t('requestsAndOffers')}</Text>
        <Text style={styles.lead}>{t('requestsPrivacyNotice')}</Text>
        {query.isPending && <Text style={styles.lead}>{t('loadingRequests')}</Text>}
        {query.isError && <Text style={styles.error}>{t('loadRequestsFailed')}</Text>}
        {query.data?.map((request) => (
          <Card key={request.id}>
            <Text style={styles.badge}>{request.status}</Text>
            <Text>{request.title}</Text>
            <Text style={styles.lead}>
              {new Date(request.created_at).toLocaleString(locale === 'ar' ? 'ar-SA' : locale)} ·{' '}
              {t('versionSummary', { version: request.version })}
            </Text>
            {request.status === 'receiving_offers' && (
              <Link href={{ pathname: '/offers', params: { requestId: request.id } }} asChild>
                <Button label={t('viewPrivateComparison')} />
              </Link>
            )}
          </Card>
        ))}
        {!query.isPending && query.data?.length === 0 && (
          <Card>
            <Text style={styles.lead}>{t('noRequests')}</Text>
            <Link href="/request/new" asChild>
              <Button label={t('createFirstRequest')} />
            </Link>
          </Card>
        )}
      </Screen>
    </ScrollView>
  );
}
