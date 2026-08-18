import { useQuery } from '@tanstack/react-query';
import { ScrollView, Text } from 'react-native';
import { z } from 'zod';
import { Card, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';

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
        <Text style={styles.title}>الأرباح والتسويات</Text>
        <Card>
          <Text style={styles.lead}>
            الإطلاق المبدئي يستخدم الدفع بعد الخدمة. لا تظهر تسوية إلكترونية ما لم يسجلها موفر دفع
            مُكوّن فعليًا.
          </Text>
        </Card>
        {query.data?.map((settlement) => (
          <Card key={settlement.id}>
            <Text style={styles.badge}>{settlement.status}</Text>
            <Text>الصافي {(settlement.net_minor / 100).toFixed(2)} ر.س</Text>
            <Text style={styles.lead}>
              الإجمالي {(settlement.gross_minor / 100).toFixed(2)} · الرسوم{' '}
              {(settlement.fee_minor / 100).toFixed(2)}
            </Text>
            <Text style={styles.lead}>
              {new Date(settlement.created_at).toLocaleString('ar-SA')}
            </Text>
          </Card>
        ))}
        {query.isError && <Text style={styles.error}>تعذر تحميل سجل التسويات.</Text>}
        {!query.isPending && query.data?.length === 0 && (
          <Text style={styles.lead}>لا توجد تسويات مسجلة.</Text>
        )}
      </Screen>
    </ScrollView>
  );
}
