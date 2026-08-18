import { useQuery } from '@tanstack/react-query';
import { ScrollView, Text } from 'react-native';
import { z } from 'zod';
import { Card, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { formatSar } from '@sallah/i18n';
import { useLocale } from '@/providers/locale-provider';

const settlementSchema = z.object({
  id: z.uuid(),
  gross_minor: z.number().int(),
  fee_minor: z.number().int(),
  net_minor: z.number().int(),
  status: z.string(),
  provider_reference: z.string().nullable(),
  created_at: z.string(),
});

export default function Earnings() {
  const { locale, t } = useLocale();
  const query = useQuery({
    queryKey: ['provider-settlements'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('provider_settlements')
        .select('id,gross_minor,fee_minor,net_minor,status,provider_reference,created_at')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return z.array(settlementSchema).parse(data ?? []);
    },
  });
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Screen>
        <Text style={styles.title}>{t('earningsTitle')}</Text>
        <Card>
          <Text style={styles.lead}>{t('earningsOfflineNotice')}</Text>
        </Card>
        {query.data?.map((settlement) => (
          <Card key={settlement.id}>
            <Text style={styles.badge}>{settlement.status}</Text>
            <Text>{t('netAmount', { amount: formatSar(settlement.net_minor, locale) })}</Text>
            <Text style={styles.lead}>
              {t('grossAndFees', {
                gross: formatSar(settlement.gross_minor, locale),
                fees: formatSar(settlement.fee_minor, locale),
              })}
            </Text>
            <Text style={styles.lead}>
              {new Date(settlement.created_at).toLocaleString(locale === 'ar' ? 'ar-SA' : locale)}
            </Text>
          </Card>
        ))}
        {query.isError && <Text style={styles.error}>{t('settlementsLoadFailed')}</Text>}
        {!query.isPending && query.data?.length === 0 && (
          <Text style={styles.lead}>{t('noSettlements')}</Text>
        )}
      </Screen>
    </ScrollView>
  );
}
