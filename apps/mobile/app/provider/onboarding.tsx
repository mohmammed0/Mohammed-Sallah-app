import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { z } from 'zod';
import { Button, Card, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { secureUpload } from '@/lib/secure-upload';
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
  const { locale, t } = useLocale();
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
      setError('root', { message: t('providerLocationRequired') });
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
      setError('root', { message: t('providerDocumentRequired') });
      return;
    }
    setDocument(asset);
  }
  const submit = useMutation({
    mutationFn: async (raw: OnboardingForm) => {
      const input = onboardingSchema.parse(raw);
      if (!categoryId || !cityId || !location || !document)
        throw new Error('MISSING_REQUIRED_FIELDS');
      const response = await fetch(document.uri);
      if (!response.ok) throw new Error('DOCUMENT_READ_FAILED');
      const bytes = new Uint8Array(await response.arrayBuffer());
      const extension = document.mimeType === 'image/png' ? 'png' : 'jpg';
      const upload = await secureUpload({
        bytes,
        filename: `${globalThis.crypto.randomUUID()}.${extension}`,
        mimeType: document.mimeType ?? 'image/jpeg',
        purpose: 'provider_document',
      });
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
              storagePath: upload.storagePath,
              contentHash: upload.contentHash,
              mimeType: upload.mimeType,
              sizeBytes: upload.sizeBytes,
            },
          ],
        },
      });
      if (error) throw error;
      return z.object({ providerId: z.uuid(), status: z.string() }).parse(data);
    },
    onSuccess: (result) =>
      Alert.alert(
        t('providerSubmissionTitle'),
        t('providerSubmissionStatus', { status: result.status }),
      ),
    onError: () =>
      setError('root', {
        message: t('providerSubmissionFailed'),
      }),
  });
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Screen>
        <Text style={styles.title}>{t('providerOnboarding')}</Text>
        <Card>
          <Text style={styles.lead}>{t('providerDocumentsNotice')}</Text>
        </Card>
        <Text style={styles.lead}>{t('accountType')}</Text>
        <Controller
          control={control}
          name="kind"
          render={({ field }) => (
            <View style={styles.row}>
              <Button
                label={t('individual')}
                kind={field.value === 'individual' ? 'primary' : 'secondary'}
                onPress={() => field.onChange('individual')}
              />
              <Button
                label={t('company')}
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
              placeholder={t('providerNamePlaceholder')}
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
              placeholder={t('commercialRegistrationPlaceholder')}
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
              placeholder={t('providerBioPlaceholder')}
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
              placeholder={t('serviceRadiusPlaceholder')}
              value={String(field.value)}
              onBlur={field.onBlur}
              onChangeText={field.onChange}
            />
          )}
        />
        <Text style={styles.lead}>{t('primaryService')}</Text>
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
        <Text style={styles.lead}>{t('city')}</Text>
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
          label={location ? t('serviceCenterSelected') : t('selectServiceCenter')}
          onPress={() => void chooseLocation()}
        />
        <Button
          kind="secondary"
          label={document ? t('documentSelectedChange') : t('attachVerificationDocument')}
          onPress={() => void chooseDocument()}
        />
        {formState.errors.root?.message && (
          <Text style={styles.error}>{formState.errors.root.message}</Text>
        )}
        <Button
          disabled={submit.isPending}
          label={t('submitForHumanReview')}
          onPress={() => void handleSubmit((value) => submit.mutate(value))()}
        />
      </Screen>
    </ScrollView>
  );
}
