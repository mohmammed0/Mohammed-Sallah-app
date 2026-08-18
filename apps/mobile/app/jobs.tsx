import { useState } from 'react';
import { Link } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Linking, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { z } from 'zod';
import { MarketplaceApi } from '@sallah/api';
import { Button, Card, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';

const changeOrderSchema = z.object({
  id: z.uuid(),
  reason: z.string(),
  description: z.string(),
  revised_total_minor: z.number().int(),
  status: z.string(),
  expires_at: z.string(),
});
const jobSchema = z.object({
  id: z.uuid(),
  customer_id: z.uuid(),
  provider_id: z.uuid(),
  status: z.string(),
  approved_total_minor: z.number().int(),
  version: z.number().int(),
  created_at: z.string(),
  conversations: z.array(z.object({ id: z.uuid() })),
  addresses: z.object({ formatted_address: z.string() }).nullable(),
  job_location_updates: z
    .array(z.object({ captured_at: z.string(), expires_at: z.string() }))
    .default([]),
  change_orders: z.array(changeOrderSchema),
});
type Job = z.infer<typeof jobSchema>;
const providerNext: Record<string, string | undefined> = {
  scheduled: 'en_route',
  en_route: 'arrived',
  arrived: 'diagnosing',
  diagnosing: 'in_progress',
};
const actionLabels: Record<string, string> = {
  scheduled: 'تأكيد الجدولة',
  en_route: 'بدء التوجه',
  arrived: 'تأكيد الوصول',
  diagnosing: 'بدء المعاينة',
  in_progress: 'بدء التنفيذ',
};

export default function Jobs() {
  const [reason, setReason] = useState('تحديث حالة العمل');
  const [rating, setRating] = useState('5');
  const [review, setReview] = useState('');
  const [changeDescription, setChangeDescription] = useState('');
  const [changeAmount, setChangeAmount] = useState('');
  const query = useQuery({
    queryKey: ['jobs'],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('AUTH_REQUIRED');
      const { data, error } = await supabase
        .from('jobs')
        .select(
          'id,customer_id,provider_id,status,approved_total_minor,version,created_at,conversations(id),addresses(formatted_address),job_location_updates(captured_at,expires_at),change_orders(id,reason,description,revised_total_minor,status,expires_at)',
        )
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return { userId: userData.user.id, jobs: z.array(jobSchema).parse(data ?? []) };
    },
  });
  const command = useMutation({
    mutationFn: async (run: () => Promise<unknown>) => run(),
    onSuccess: async () => {
      await query.refetch();
    },
    onError: () => Alert.alert('تعذر تنفيذ الأمر', 'تحقق من دور الطرف والحالة الحالية والاتصال.'),
  });
  function transition(job: Job, status: string) {
    command.mutate(() =>
      new MarketplaceApi(supabase).transitionJob(
        job.id,
        status,
        reason.trim() || 'تحديث حالة العمل',
        globalThis.crypto.randomUUID(),
      ),
    );
  }
  async function submitCompletion(job: Job) {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images', 'videos'],
      quality: 0.75,
      exif: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if ((asset.fileSize ?? 0) > 20 * 1024 * 1024) throw new Error('PROOF_TOO_LARGE');
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) throw new Error('AUTH_REQUIRED');
    const response = await fetch(asset.uri);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const mimeType = asset.mimeType ?? 'image/jpeg';
    const extension = mimeType === 'video/mp4' ? 'mp4' : mimeType === 'image/png' ? 'png' : 'jpg';
    const storagePath = `${userData.user.id}/jobs/${job.id}/${globalThis.crypto.randomUUID()}.${extension}`;
    const { error: uploadError } = await supabase.storage
      .from('completion-proofs')
      .upload(storagePath, bytes, { contentType: mimeType, upsert: false });
    if (uploadError) throw uploadError;
    const { error } = await supabase.rpc('submit_completion', {
      p_job_id: job.id,
      p_proofs: [
        { storagePath, mimeType, sizeBytes: bytes.byteLength, description: 'إثبات إتمام العمل' },
      ],
      p_idempotency_key: globalThis.crypto.randomUUID(),
    });
    if (error) throw error;
  }
  async function shareCurrentLocation(job: Job) {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) throw new Error('LOCATION_PERMISSION_REQUIRED');
    const position = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    const { error } = await supabase.rpc('record_job_location', {
      p_job_id: job.id,
      p_latitude: position.coords.latitude,
      p_longitude: position.coords.longitude,
      p_accuracy_m: position.coords.accuracy ?? 0,
      p_consent: true,
    });
    if (error) throw error;
    Alert.alert(
      'تمت مشاركة الموقع',
      'التحديث متاح لطرفي العمل فقط وينتهي تلقائيًا خلال أربع ساعات.',
    );
  }
  function confirmLocationShare(job: Job) {
    Alert.alert(
      'مشاركة موقع أمامية',
      'سيُرسل موقعك الحالي مرة واحدة للعميل في هذا العمل. لا يعمل أي تتبع في الخلفية.',
      [
        { text: 'إلغاء', style: 'cancel' },
        {
          text: 'مشاركة الآن',
          onPress: () => command.mutate(() => shareCurrentLocation(job)),
        },
      ],
    );
  }
  async function openNativeMaps(job: Job) {
    const address = job.addresses?.formatted_address;
    if (!address) throw new Error('ADDRESS_NOT_AVAILABLE');
    const query = encodeURIComponent(address);
    const url = Platform.OS === 'ios' ? `https://maps.apple.com/?q=${query}` : `geo:0,0?q=${query}`;
    if (!(await Linking.canOpenURL(url))) throw new Error('MAPS_NOT_AVAILABLE');
    await Linking.openURL(url);
  }
  async function accept(job: Job, accepted: boolean) {
    const score = Number(rating);
    const { error } = await supabase.rpc('accept_completion', {
      p_job_id: job.id,
      p_accept: accepted,
      p_reason: accepted ? 'العميل قبل الإنجاز' : reason.trim() || 'الإنجاز غير مقبول',
      p_score: accepted ? score : 1,
      p_review: review,
      p_idempotency_key: globalThis.crypto.randomUUID(),
    });
    if (error) throw error;
  }
  async function createChangeOrder(job: Job) {
    const amountMinor = Math.round(Number(changeAmount) * 100);
    if (changeDescription.trim().length < 5 || !Number.isFinite(amountMinor) || amountMinor < 0)
      throw new Error('INVALID_CHANGE_ORDER');
    const { error } = await supabase.rpc('create_change_order', {
      payload: {
        jobId: job.id,
        reason: 'تغير النطاق بعد المعاينة',
        description: changeDescription.trim(),
        lineItems: [{ description: changeDescription.trim(), quantity: 1, amountMinor }],
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
        idempotencyKey: globalThis.crypto.randomUUID(),
      },
    });
    if (error) throw error;
  }
  async function decideChangeOrder(orderId: string, approve: boolean) {
    const { error } = await supabase.rpc('decide_change_order', {
      p_change_order_id: orderId,
      p_approve: approve,
      p_reason: approve ? 'وافق العميل على التغيير' : 'رفض العميل التغيير',
      p_idempotency_key: globalThis.crypto.randomUUID(),
    });
    if (error) throw error;
  }
  async function openDispute(job: Job) {
    const { error } = await supabase.rpc('open_dispute', {
      p_job_id: job.id,
      p_reason: reason.trim() || 'نزاع على العمل',
      p_idempotency_key: globalThis.crypto.randomUUID(),
    });
    if (error) throw error;
  }
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Screen>
        <Text style={styles.title}>الأعمال</Text>
        <TextInput
          style={styles.input}
          value={reason}
          onChangeText={setReason}
          placeholder="سبب الإجراء أو النزاع"
        />
        {query.isPending && <Text style={styles.lead}>جارٍ تحميل الأعمال…</Text>}
        {query.isError && <Text style={styles.error}>سجّل الدخول لتحميل أعمالك.</Text>}
        {query.data?.jobs.map((job) => {
          const customer = job.customer_id === query.data?.userId;
          const next =
            customer && job.status === 'provider_selected'
              ? 'scheduled'
              : !customer
                ? providerNext[job.status]
                : undefined;
          return (
            <Card key={job.id}>
              <Text style={styles.badge}>{job.status}</Text>
              <Text>الإجمالي المعتمد {(job.approved_total_minor / 100).toFixed(2)} ر.س</Text>
              <Text style={styles.lead}>
                نسخة {job.version} · {customer ? 'عميل' : 'مقدم خدمة'}
              </Text>
              {next && (
                <Button
                  disabled={command.isPending}
                  label={actionLabels[next] ?? next}
                  onPress={() => transition(job, next)}
                />
              )}
              {!customer && job.status === 'en_route' && (
                <Button
                  kind="secondary"
                  disabled={command.isPending}
                  label="مشاركة موقعي الحالي مرة واحدة"
                  onPress={() => confirmLocationShare(job)}
                />
              )}
              {job.addresses?.formatted_address && (
                <Button
                  kind="secondary"
                  label="فتح وجهة العمل في خرائط الجهاز"
                  onPress={() => command.mutate(() => openNativeMaps(job))}
                />
              )}
              {customer && job.status === 'en_route' && (
                <Text style={styles.lead} accessibilityLiveRegion="polite">
                  {job.job_location_updates[0]
                    ? `آخر تحديث موقع مصرح: ${new Date(
                        job.job_location_updates[0].captured_at,
                      ).toLocaleTimeString('ar-SA')}`
                    : 'لم يشارك مقدم الخدمة تحديث موقع بعد.'}
                </Text>
              )}
              {!customer && job.status === 'diagnosing' && (
                <>
                  <TextInput
                    style={styles.input}
                    value={changeDescription}
                    onChangeText={setChangeDescription}
                    placeholder="وصف تغيير النطاق"
                  />
                  <TextInput
                    style={styles.input}
                    value={changeAmount}
                    onChangeText={setChangeAmount}
                    keyboardType="decimal-pad"
                    placeholder="القيمة الإضافية بالريال"
                  />
                  <Button
                    kind="secondary"
                    label="إرسال تغيير نطاق للموافقة"
                    onPress={() => command.mutate(() => createChangeOrder(job))}
                  />
                </>
              )}
              {customer &&
                job.change_orders
                  .filter((item) => item.status === 'pending')
                  .map((order) => (
                    <Card key={order.id}>
                      <Text>{order.description}</Text>
                      <Text style={styles.lead}>
                        الإجمالي المعدل {(order.revised_total_minor / 100).toFixed(2)} ر.س
                      </Text>
                      <View style={styles.row}>
                        <Button
                          label="موافقة"
                          onPress={() => command.mutate(() => decideChangeOrder(order.id, true))}
                        />
                        <Button
                          kind="danger"
                          label="رفض"
                          onPress={() => command.mutate(() => decideChangeOrder(order.id, false))}
                        />
                      </View>
                    </Card>
                  ))}
              {!customer && job.status === 'in_progress' && (
                <Button
                  label="رفع إثبات الإنجاز"
                  onPress={() => command.mutate(() => submitCompletion(job))}
                />
              )}
              {customer && job.status === 'completion_submitted' && (
                <>
                  <TextInput
                    style={styles.input}
                    value={rating}
                    onChangeText={setRating}
                    keyboardType="number-pad"
                    placeholder="التقييم من 1 إلى 5"
                  />
                  <TextInput
                    style={styles.input}
                    value={review}
                    onChangeText={setReview}
                    placeholder="مراجعة اختيارية"
                  />
                  <View style={styles.row}>
                    <Button
                      label="قبول الإنجاز"
                      onPress={() => command.mutate(() => accept(job, true))}
                    />
                    <Button
                      kind="danger"
                      label="رفض وفتح نزاع"
                      onPress={() => command.mutate(() => accept(job, false))}
                    />
                  </View>
                </>
              )}
              {job.conversations[0] && (
                <Link
                  href={{
                    pathname: '/messages',
                    params: { conversationId: job.conversations[0].id },
                  }}
                  asChild
                >
                  <Button kind="secondary" label="فتح المحادثة" />
                </Link>
              )}
              <Button
                kind="danger"
                label="فتح نزاع"
                onPress={() => command.mutate(() => openDispute(job))}
              />
            </Card>
          );
        })}
        {!query.isPending && query.data?.jobs.length === 0 && (
          <Card>
            <Text style={styles.lead}>لا توجد أعمال نشطة أو سابقة.</Text>
          </Card>
        )}
      </Screen>
    </ScrollView>
  );
}
