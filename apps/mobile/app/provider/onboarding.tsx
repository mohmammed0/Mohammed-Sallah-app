import { useEffect, useRef, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Linking, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { z } from 'zod';
import { formatStatusLabel } from '@sallah/i18n';
import { Button, Card, LoadingSkeleton, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { secureUpload } from '@/lib/secure-upload';
import { useLocale } from '@/providers/locale-provider';
import { useSessionContext } from '@/providers/session-provider';
import {
  parseProviderOnboardingDraft,
  preserveProviderSelections,
  type ProviderOnboardingDraft,
} from '@/features/provider/onboarding-draft';
import { executeJournaledMutation } from '@/lib/mutation-journal';
import {
  acquireForegroundLocation,
  locationRecoveryForResult,
} from '@/features/location/location-device';

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
  const { session } = useSessionContext();
  const ownerId = session?.user.id;
  const mounted = useRef(false);
  const currentOwner = useRef(ownerId);
  currentOwner.current = ownerId;
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const hydrated = useRef(false);
  const [savedDraft, setSavedDraft] = useState<ProviderOnboardingDraft | null>(null);
  const [ready, setReady] = useState(false);
  const [categoryIds, setCategoryIds] = useState<string[]>([]);
  const [cityIds, setCityIds] = useState<string[]>([]);
  const [weekdays, setWeekdays] = useState<number[]>([0, 1, 2, 3, 4]);
  const [location, setLocation] = useState<{ latitude: number; longitude: number } | null>(null);
  const [locationChanged, setLocationChanged] = useState(false);
  const [locationRecovery, setLocationRecovery] = useState<'retry' | 'settings' | null>(null);
  const [documents, setDocuments] = useState<ImagePicker.ImagePickerAsset[]>([]);
  const { clearErrors, control, handleSubmit, formState, reset, setError } =
    useForm<OnboardingForm>({
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
  const status = useQuery({
    queryKey: ['provider-onboarding-status', ownerId],
    enabled: Boolean(ownerId),
    queryFn: async () => {
      if (!ownerId) throw new Error('AUTH_REQUIRED');
      const [profile, services, areas, availability, retainedDocuments] = await Promise.all([
        supabase
          .from('provider_profiles')
          .select(
            'kind,business_name,commercial_registration_reference,bio,service_radius_km,verification_status,updated_at',
          )
          .eq('user_id', ownerId)
          .maybeSingle(),
        supabase
          .from('provider_services')
          .select('category_id,subcategory_id')
          .eq('provider_id', ownerId)
          .eq('enabled', true),
        supabase
          .from('provider_service_areas')
          .select('city_id,center,radius_m')
          .eq('provider_id', ownerId)
          .eq('enabled', true),
        supabase
          .from('provider_availability')
          .select('weekday,start_time,end_time')
          .eq('provider_id', ownerId)
          .order('weekday'),
        supabase
          .from('provider_documents')
          .select('id')
          .eq('provider_id', ownerId)
          .is('deleted_at', null),
      ]);
      for (const result of [profile, services, areas, availability, retainedDocuments])
        if (result.error) throw result.error;
      return parseProviderOnboardingDraft({
        profile: profile.data,
        services: services.data,
        areas: areas.data,
        availability: availability.data,
        documents: retainedDocuments.data,
      });
    },
  });
  useEffect(() => {
    // Only the initial owner snapshot hydrates the form. Background refetches
    // update review status without replacing unsaved text or selection edits.
    if (!status.isSuccess || hydrated.current) return;
    hydrated.current = true;
    const draft = status.data;
    setSavedDraft(draft);
    if (draft) {
      reset({
        kind: draft.profile.kind,
        businessName: draft.profile.business_name ?? '',
        commercialRegistrationReference: draft.profile.commercial_registration_reference ?? '',
        bio: draft.profile.bio ?? '',
        serviceRadiusKm: draft.profile.service_radius_km,
      });
      setCategoryIds(draft.services.map((service) => service.categoryId));
      setCityIds([...new Set(draft.serviceAreas.map((area) => area.cityId))]);
      setLocation(draft.serviceAreas.find((area) => area.location)?.location ?? null);
      setWeekdays([...new Set(draft.availability.map((slot) => slot.weekday))]);
    }
    setReady(true);
  }, [status.isSuccess, status.data, reset]);
  async function assertCurrentOwner() {
    if (!ownerId || !mounted.current || currentOwner.current !== ownerId)
      throw new Error('AUTH_CHANGED');
    const { data, error } = await supabase.auth.getUser();
    if (error || data.user?.id !== ownerId || !mounted.current || currentOwner.current !== ownerId)
      throw new Error('AUTH_CHANGED');
    return ownerId;
  }
  async function chooseLocation() {
    if (locationRecovery === 'settings') {
      try {
        await Linking.openSettings();
        setLocationRecovery('retry');
      } catch {
        setError('root', { message: t('providerLocationRequired') });
      }
      return;
    }
    clearErrors('root');
    try {
      const result = await acquireForegroundLocation(({ coordinates }) => {
        setLocation(coordinates);
        setLocationChanged(true);
      });
      const recovery = locationRecoveryForResult(result);
      setLocationRecovery(recovery.action);
      if (recovery.messageKey) setError('root', { message: t(recovery.messageKey) });
    } catch {
      setError('root', { message: t('providerLocationRequired') });
    }
  }
  async function chooseDocument() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.82,
      exif: false,
      allowsMultipleSelection: true,
      selectionLimit: 5,
    });
    if (result.canceled || !result.assets.length) return;
    if (
      result.assets.some(
        (asset) =>
          (asset.fileSize ?? 0) > 20 * 1024 * 1024 ||
          !(asset.mimeType ?? 'image/jpeg').match(/^image\/(jpeg|png)$/),
      )
    ) {
      setError('root', { message: t('providerDocumentRequired') });
      return;
    }
    setDocuments(result.assets);
  }
  const submit = useMutation({
    mutationFn: async ({ raw, shouldSubmit }: { raw: OnboardingForm; shouldSubmit: boolean }) => {
      if (!ready || status.isError || catalog.isError) throw new Error('PROVIDER_DRAFT_NOT_READY');
      await assertCurrentOwner();
      if (!weekdays.length) throw new Error('PROVIDER_AVAILABILITY_REQUIRED');
      const input = onboardingSchema.parse(raw);
      const selections = preserveProviderSelections({
        saved: savedDraft,
        categoryIds,
        cityIds,
        weekdays,
        location,
        locationChanged,
        radiusKm: input.serviceRadiusKm,
        radiusChanged: Boolean(formState.dirtyFields.serviceRadiusKm),
      });
      if (
        !categoryIds.length ||
        !cityIds.length ||
        selections.serviceAreas.some((area) => !area.location) ||
        (shouldSubmit && !documents.length && !(status.data?.documentCount ?? 0))
      )
        throw new Error('MISSING_REQUIRED_FIELDS');
      const uploadedDocuments = await Promise.all(
        documents.map(async (document, index) => {
          const response = await fetch(document.uri);
          if (!response.ok) throw new Error('DOCUMENT_READ_FAILED');
          const bytes = new Uint8Array(await response.arrayBuffer());
          const extension = document.mimeType === 'image/png' ? 'png' : 'jpg';
          const documentType =
            input.kind === 'company' && index === 0
              ? 'commercial_registration'
              : 'identity_or_license';
          await assertCurrentOwner();
          return await secureUpload({
            bytes,
            filename: `${globalThis.crypto.randomUUID()}.${extension}`,
            mimeType: document.mimeType ?? 'image/jpeg',
            purpose: 'provider_document',
            recoveryKey: `provider-document:${documentType}:${index + 1}`,
          });
        }),
      );
      const commandPayload = {
        ...input,
        ...selections,
        locale,
        submit: shouldSubmit,
        documents: uploadedDocuments.map((upload, index) => ({
          uploadId: upload.uploadId,
          documentType:
            input.kind === 'company' && index === 0
              ? 'commercial_registration'
              : 'identity_or_license',
        })),
      };
      const verifiedOwnerId = await assertCurrentOwner();
      return executeJournaledMutation({
        userId: verifiedOwnerId,
        operation: 'provider_onboarding',
        entityKey: shouldSubmit ? 'submit' : 'draft',
        payload: commandPayload,
        execute: async (idempotencyKey, persistedPayload) => {
          await assertCurrentOwner();
          const authoritativePayload = z.record(z.string(), z.unknown()).parse(persistedPayload);
          const { data, error } = await supabase.rpc('upsert_provider_onboarding', {
            payload: { ...authoritativePayload, idempotencyKey },
          });
          if (error) throw error;
          return z.object({ providerId: z.uuid(), status: z.string() }).parse(data);
        },
      });
    },
    onSuccess: async (result) => {
      try {
        await assertCurrentOwner();
      } catch {
        return;
      }
      void status.refetch();
      Alert.alert(
        t('providerSubmissionTitle'),
        t('providerSubmissionStatus', { status: formatStatusLabel(result.status, locale) }),
      );
    },
    onError: (error) => {
      if (!mounted.current || currentOwner.current !== ownerId) return;
      setError('root', {
        message: t(
          error.message === 'PROVIDER_AVAILABILITY_REQUIRED'
            ? 'providerAvailabilityRequired'
            : 'providerSubmissionFailed',
        ),
      });
    },
  });
  if (catalog.isError || status.isError)
    return (
      <Screen>
        <Text style={styles.title}>{t('providerOnboarding')}</Text>
        <Text style={styles.error} accessibilityRole="alert">
          {t('providerDraftLoadFailed')}
        </Text>
        <Button
          label={t('retry')}
          onPress={() => {
            void catalog.refetch();
            void status.refetch();
          }}
        />
      </Screen>
    );
  if (!ready || catalog.isPending)
    return (
      <Screen>
        <Text style={styles.title}>{t('providerOnboarding')}</Text>
        <LoadingSkeleton label={t('loading')} />
      </Screen>
    );
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Screen>
        <Text style={styles.title}>{t('providerOnboarding')}</Text>
        <Card>
          <Text style={styles.lead}>{t('providerDocumentsNotice')}</Text>
          <Text style={styles.badge}>
            {t('providerCurrentStatus', {
              status: formatStatusLabel(status.data?.profile.verification_status ?? 'new', locale),
            })}
          </Text>
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
              accessibilityLabel={t('providerNamePlaceholder')}
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
              accessibilityLabel={t('commercialRegistrationPlaceholder')}
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
              accessibilityLabel={t('providerBioPlaceholder')}
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
              accessibilityLabel={t('serviceRadiusPlaceholder')}
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
              kind={categoryIds.includes(category.id) ? 'primary' : 'secondary'}
              label={category.service_category_translations[0]?.name ?? category.slug}
              onPress={() =>
                setCategoryIds((current) =>
                  current.includes(category.id)
                    ? current.filter((id) => id !== category.id)
                    : [...current, category.id],
                )
              }
            />
          ))}
        </View>
        <Text style={styles.lead}>{t('city')}</Text>
        <View style={styles.row}>
          {catalog.data?.cities.map((city) => (
            <Button
              key={city.id}
              kind={cityIds.includes(city.id) ? 'primary' : 'secondary'}
              label={locale === 'ar' ? city.name_ar : city.name_en}
              onPress={() =>
                setCityIds((current) =>
                  current.includes(city.id)
                    ? current.filter((id) => id !== city.id)
                    : [...current, city.id],
                )
              }
            />
          ))}
        </View>
        <Text style={styles.lead}>{t('availability')}</Text>
        <View style={styles.row}>
          {[0, 1, 2, 3, 4, 5, 6].map((weekday) => (
            <Button
              key={weekday}
              kind={weekdays.includes(weekday) ? 'primary' : 'secondary'}
              label={t('weekdayNumber', { day: weekday })}
              onPress={() =>
                setWeekdays((current) =>
                  current.includes(weekday)
                    ? current.filter((day) => day !== weekday)
                    : [...current, weekday],
                )
              }
            />
          ))}
        </View>
        <Text style={styles.lead}>{t('providerLocationRequired')}</Text>
        <Button
          kind="secondary"
          label={
            locationRecovery === 'settings'
              ? t('openDeviceSettings')
              : location
                ? t('serviceCenterSelected')
                : t('selectServiceCenter')
          }
          onPress={() => void chooseLocation()}
        />
        <Button
          kind="secondary"
          label={
            documents.length
              ? t('documentsSelected', { count: documents.length })
              : t('attachVerificationDocument')
          }
          onPress={() => void chooseDocument()}
        />
        {Boolean(status.data?.documentCount) && (
          <Text style={styles.lead}>
            {t('providerDocumentsRetained', { count: status.data?.documentCount ?? 0 })}
          </Text>
        )}
        {formState.errors.root?.message && (
          <Text style={styles.error}>{formState.errors.root.message}</Text>
        )}
        <View style={styles.row}>
          <Button
            kind="secondary"
            disabled={submit.isPending}
            label={t('saveDraft')}
            onPress={() =>
              void handleSubmit((value) => submit.mutate({ raw: value, shouldSubmit: false }))()
            }
          />
          <Button
            disabled={submit.isPending}
            label={
              status.data?.profile.verification_status === 'more_information_required'
                ? t('resubmitForReview')
                : t('submitForHumanReview')
            }
            onPress={() =>
              void handleSubmit((value) => submit.mutate({ raw: value, shouldSubmit: true }))()
            }
          />
        </View>
      </Screen>
    </ScrollView>
  );
}
