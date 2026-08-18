import { Link } from 'expo-router';
import { useQuery } from '@tanstack/react-query';
import { ScrollView, Text } from 'react-native';
import { z } from 'zod';
import { Button, Card, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';

const requestSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  status: z.string(),
  version: z.number().int(),
  created_at: z.string(),
});

export default function Requests() {
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
        <Text style={styles.title}>طلباتي والعروض</Text>
        <Text style={styles.lead}>العروض خاصة بك وحدك، ولا يستطيع مقدم خدمة رؤية عرض منافس.</Text>
        {query.isPending && <Text style={styles.lead}>جارٍ تحميل الطلبات…</Text>}
        {query.isError && <Text style={styles.error}>تعذر تحميل الطلبات الحالية.</Text>}
        {query.data?.map((request) => (
          <Card key={request.id}>
            <Text style={styles.badge}>{request.status}</Text>
            <Text>{request.title}</Text>
            <Text style={styles.lead}>
              {new Date(request.created_at).toLocaleString('ar-SA')} · نسخة {request.version}
            </Text>
            {request.status === 'receiving_offers' && (
              <Link href={{ pathname: '/offers', params: { requestId: request.id } }} asChild>
                <Button label="عرض المقارنة الخاصة" />
              </Link>
            )}
          </Card>
        ))}
        {!query.isPending && query.data?.length === 0 && (
          <Card>
            <Text style={styles.lead}>لا توجد طلبات بعد.</Text>
            <Link href="/request/new" asChild>
              <Button label="إنشاء أول طلب" />
            </Link>
          </Card>
        )}
      </Screen>
    </ScrollView>
  );
}
