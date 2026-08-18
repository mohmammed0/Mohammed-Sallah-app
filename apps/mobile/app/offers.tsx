import { useState } from 'react';
import { useLocalSearchParams, router } from 'expo-router';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, ScrollView, Text } from 'react-native';
import { z } from 'zod';
import { Button, Card, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';

const offerSchema = z.object({
  id: z.uuid(),
  providerId: z.uuid(),
  providerName: z.string(),
  rating: z.coerce.number(),
  ratingCount: z.number().int(),
  completedJobs: z.number().int(),
  totalAmountMinor: z.number().int(),
  visitFeeMinor: z.number().int(),
  materialsIncluded: z.boolean(),
  materialsEstimateMinor: z.number().int().nullable(),
  estimatedArrivalMinutes: z.number().int(),
  estimatedDurationMinutes: z.number().int(),
  warrantyDays: z.number().int(),
  note: z.string(),
  expiresAt: z.string(),
  status: z.string(),
});

export default function Offers() {
  const { requestId } = useLocalSearchParams<{ requestId?: string }>();
  const [error, setError] = useState('');
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ['customer-offers', requestId],
    enabled: Boolean(requestId),
    queryFn: async () => {
      if (!requestId) return [];
      const { data, error: rpcError } = await supabase.rpc('get_customer_offers', {
        p_request_id: requestId,
      });
      if (rpcError) throw rpcError;
      return z.array(offerSchema).parse(data);
    },
  });
  const selectOffer = useMutation({
    mutationFn: async (offerId: string) => {
      const { data, error: rpcError } = await supabase.rpc('select_offer', {
        p_offer_id: offerId,
        p_idempotency_key: globalThis.crypto.randomUUID(),
      });
      if (rpcError) throw rpcError;
      return z.string().uuid().parse(data);
    },
    onSuccess: async (jobId) => {
      await queryClient.invalidateQueries({ queryKey: ['customer-requests'] });
      Alert.alert('تم اختيار مقدم الخدمة', 'أُنشئ العمل والمحادثة وكشف العنوان للطرف المختار فقط.');
      router.replace({ pathname: '/jobs', params: { jobId } });
    },
    onError: () => setError('تعذر اختيار العرض؛ ربما انتهت صلاحيته أو تغيّرت حالة الطلب.'),
  });
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Screen>
        <Text style={styles.title}>مقارنة العروض الخاصة</Text>
        <Text style={styles.lead}>
          لا نضع شارة «الأفضل» المضللة؛ قارن السعر والوقت والخبرة والضمان.
        </Text>
        {!requestId && <Text style={styles.error}>معرّف الطلب مفقود.</Text>}
        {query.isPending && <Text style={styles.lead}>جارٍ تحميل العروض…</Text>}
        {query.isError && <Text style={styles.error}>تعذر تحميل العروض.</Text>}
        {query.data?.map((offer) => (
          <Card key={offer.id}>
            <Text style={styles.badge}>{(offer.totalAmountMinor / 100).toFixed(2)} ر.س</Text>
            <Text>{offer.providerName}</Text>
            <Text style={styles.lead}>
              تقييم {offer.rating.toFixed(1)} ({offer.ratingCount}) · {offer.completedJobs} أعمال
              مكتملة
            </Text>
            <Text style={styles.lead}>
              وصول خلال {offer.estimatedArrivalMinutes} دقيقة · مدة {offer.estimatedDurationMinutes}{' '}
              دقيقة
            </Text>
            <Text style={styles.lead}>
              {offer.materialsIncluded ? 'المواد مشمولة' : 'المواد غير مشمولة'} · ضمان{' '}
              {offer.warrantyDays} يومًا
            </Text>
            {offer.note.length > 0 && <Text>{offer.note}</Text>}
            <Button
              disabled={selectOffer.isPending}
              label="اختيار هذا العرض"
              onPress={() => selectOffer.mutate(offer.id)}
            />
          </Card>
        ))}
        {query.data?.length === 0 && <Text style={styles.lead}>لا توجد عروض سارية حتى الآن.</Text>}
        {error.length > 0 && <Text style={styles.error}>{error}</Text>}
      </Screen>
    </ScrollView>
  );
}
