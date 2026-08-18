import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { z } from 'zod';
import { Button, Card, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/providers/locale-provider';

const onboardingSchema = z.object({
  kind: z.enum(['individual', 'company']),
  businessName: z.string().trim().min(2).max(160),
  commercialRegistrationReference: z.string().trim().max(100),
  bio: z.string().trim().min(10).max(2000),
  serviceRadiusKm: z.coerce.number().int().min(1).max(250),
});
type OnboardingForm = z.input<typeof onboardingSchema>;
const categorySchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  service_category_translations: z.array(z.object({ name: z.string() })),
});
const citySchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name_ar: z.string(),
  name_en: z.string(),
});

export default function ProviderOnboarding() {
  const { locale } = useLocale();
  const [categoryId, setCategoryId] = useState('');
  const [cityId, setCityId] = useState('');
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [document, setDocument] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const { control, handleSubmit, formState, setError } = useForm<OnboardingForm>({
    defaultValues: {
      kind: 'individual',
      businessName: '',
      commercialRegistrationReference: '',
      bio: '',
      serviceRadiusKm: 20,
    },
  });
  const catalog = useQuery({
    queryKey: ['provider-onboarding-catalog', locale],
    queryFn: async () => {
      const [categoriesResult, citiesResult] = await Promise.all([
        supabase
          .from('service_categories')
          .select('id,slug,service_category_translations(name)')
          .eq('service_category_translations.locale', locale)
          .eq('enabled', true)
          .order('sort_order'),
        supabase
          .from('cities')
          .select('id,code,name_ar,name_en')
          .eq('enabled', true)
          .order('name_ar'),
      ]);
      if (categoriesResult.error) throw categoriesResult.error;
      if (citiesResult.error) throw citiesResult.error;
      return {
        categories: z.array(categorySchema).parse(categoriesResult.data ?? []),
        cities: z.array(citySchema).parse(citiesResult.data ?? []),
      };
    },
  });
  async function chooseLocation() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      setError('root', { message: 'يلزم موقع مركز نطاق الخدمة؛ لا نستخدم موقع الخلفية.' });
      return;
    }
    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    setLocation({ latitude: current.coords.latitude, longitude: current.coords.longitude });
  }
  async function chooseDocument() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.82,
      exif: false,
    });
    if (result.canceled || !result.assets[0]) return;
    const asset = result.assets[0];
    if (
      (asset.fileSize ?? 0) > 20 * 1024 * 1024 ||
      !(asset.mimeType ?? 'image/jpeg').match(/^image\/(jpeg|png)$/)
    ) {
      setError('root', { message: 'وثيقة JPEG/PNG مطلوبة وبحجم لا يتجاوز 20MB.' });
      return;
    }
    setDocument(asset);
  }
  const submit = useMutation({
    mutationFn: async (raw: OnboardingForm) => {
      const input = onboardingSchema.parse(raw);
      if (!categoryId || !cityId || !location || !document)
        throw new Error('MISSING_REQUIRED_FIELDS');
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('AUTH_REQUIRED');
      const response = await fetch(document.uri);
      if (!response.ok) throw new Error('DOCUMENT_READ_FAILED');
      const bytes = new Uint8Array(await response.arrayBuffer());
      const contentHash = bytesToHex(sha256(bytes));
      const extension = document.mimeType === 'image/png' ? 'png' : 'jpg';
      const storagePath = `${userData.user.id}/verification/${globalThis.crypto.randomUUID()}.${extension}`;
      const { error: uploadError } = await supabase.storage
        .from('provider-documents')
        .upload(storagePath, bytes, {
          contentType: document.mimeType ?? 'image/jpeg',
          upsert: false,
        });
      if (uploadError) throw uploadError;
      const { data, error } = await supabase.rpc('upsert_provider_onboarding', {
        payload: {
          ...input,
          categoryId,
          cityId,
          location,
          locale,
          documents: [
            {
              documentType:
                input.kind === 'company' ? 'commercial_registration' : 'identity_or_license',
              storagePath,
              contentHash,
              mimeType: document.mimeType ?? 'image/jpeg',
              sizeBytes: bytes.byteLength,
            },
          ],
        },
      });
      if (error) throw error;
      return z.object({ providerId: z.uuid(), status: z.string() }).parse(data);
    },
    onSuccess: (result) =>
      Alert.alert(
        'تم إرسال الملف',
        `الحالة: ${result.status}. لا يبدأ استقبال الطلبات قبل المراجعة البشرية.`,
      ),
    onError: () =>
      setError('root', {
        message: 'أكمل الخدمة والمدينة والموقع والوثيقة، ثم تحقق من تسجيل الدخول والاتصال.',
      }),
  });
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Screen>
        <Text style={styles.title}>تسجيل مقدم الخدمة</Text>
        <Card>
          <Text style={styles.lead}>
            الوثائق خاصة ولا تظهر للعملاء. التحقق قرار بشري مسجل، وليس موافقة آلية.
          </Text>
        </Card>
        <Text style={styles.lead}>نوع الحساب</Text>
        <Controller
          control={control}
          name="kind"
          render={({ field }) => (
            <View style={styles.row}>
              <Button
                label="فرد"
                kind={field.value === 'individual' ? 'primary' : 'secondary'}
                onPress={() => field.onChange('individual')}
              />
              <Button
                label="منشأة"
                kind={field.value === 'company' ? 'primary' : 'secondary'}
                onPress={() => field.onChange('company')}
              />
            </View>
          )}
        />
        <Controller
          control={control}
          name="businessName"
          render={({ field }) => (
            <TextInput
              style={styles.input}
              placeholder="الاسم المهني أو اسم المنشأة"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="commercialRegistrationReference"
          render={({ field }) => (
            <TextInput
              style={styles.input}
              placeholder="مرجع السجل التجاري للمنشآت (اختياري)"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="bio"
          render={({ field }) => (
            <TextInput
              style={[styles.input, { minHeight: 100, textAlignVertical: 'top' }]}
              multiline
              placeholder="خبرتك والخدمات التي تنفذها"
              value={field.value}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
            />
          )}
        />
        <Controller
          control={control}
          name="serviceRadiusKm"
          render={({ field }) => (
            <TextInput
              style={styles.input}
              keyboardType="number-pad"
              placeholder="نطاق الخدمة بالكيلومتر"
              value={String(field.value)}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
            />
          )}
        />
        <Text style={styles.lead}>الخدمة الرئيسية</Text>
        <View style={styles.row}>
          {catalog.data?.categories.map((category) => (
            <Button
              key={category.id}
              kind={categoryId === category.id ? 'primary' : 'secondary'}
              label={category.service_category_translations[0]?.name ?? category.slug}
              onPress={() => setCategoryId(category.id)}
            />
          ))}
        </View>
        <Text style={styles.lead}>المدينة</Text>
        <View style={styles.row}>
          {catalog.data?.cities.map((city) => (
            <Button
              key={city.id}
              kind={cityId === city.id ? 'primary' : 'secondary'}
              label={locale === 'ar' ? city.name_ar : city.name_en}
              onPress={() => setCityId(city.id)}
            />
          ))}
        </View>
        <Button
          kind="secondary"
          label={location ? 'تم تحديد مركز نطاق الخدمة' : 'تحديد مركز نطاق الخدمة'}
          onPress={() => void chooseLocation()}
        />
        <Button
          kind="secondary"
          label={document ? 'تم اختيار الوثيقة — تغيير' : 'إرفاق وثيقة تحقق'}
          onPress={() => void chooseDocument()}
        />
        {formState.errors.root?.message && (
          <Text style={styles.error}>{formState.errors.root.message}</Text>
        )}
        <Button
          disabled={submit.isPending}
          label="إرسال للمراجعة البشرية"
          onPress={() => void handleSubmit((value) => submit.mutate(value))()}
        />
      </Screen>
    </ScrollView>
  );
}
