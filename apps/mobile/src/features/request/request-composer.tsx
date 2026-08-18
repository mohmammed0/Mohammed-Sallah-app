import { useEffect, useMemo, useState } from 'react';
import { Alert, Image, ScrollView, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import {
  AudioModule,
  RecordingPresets,
  setAudioModeAsync,
  useAudioRecorder,
  useAudioRecorderState,
} from 'expo-audio';
import { DeterministicAiProvider, aiDiagnosticSchema, type AiDiagnostic } from '@sallah/domain';
import { z } from 'zod';
import { Button, Card, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { secureUpload } from '@/lib/secure-upload';
import { useLocale } from '@/providers/locale-provider';

const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const MAX_RECORDING_MS = 120_000;
const categorySchema = z.object({
  slug: z.string(),
  service_category_translations: z.array(z.object({ name: z.string() })),
});
const citySchema = z.object({ code: z.string(), name_ar: z.string(), name_en: z.string() });
const functionResultSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() });

export function RequestComposer() {
  const { locale, t } = useLocale();
  const [description, setDescription] = useState('');
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [diagnostic, setDiagnostic] = useState<AiDiagnostic | null>(null);
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [coordinates, setCoordinates] = useState<{ latitude: number; longitude: number } | null>(
    null,
  );
  const [categorySlug, setCategorySlug] = useState('');
  const [cityCode, setCityCode] = useState('');
  const [urgency, setUrgency] = useState<'flexible' | 'normal' | 'urgent' | 'safety_critical'>(
    'normal',
  );
  const [schedule, setSchedule] = useState<'asap' | 'today' | 'flexible'>('flexible');
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);
  const catalog = useQuery({
    queryKey: ['request-catalog', locale],
    queryFn: async () => {
      const [categoriesResult, citiesResult] = await Promise.all([
        supabase
          .from('service_categories')
          .select('slug,service_category_translations(name)')
          .eq('service_category_translations.locale', locale)
          .eq('enabled', true)
          .order('sort_order'),
        supabase.from('cities').select('code,name_ar,name_en').eq('enabled', true).order('name_ar'),
      ]);
      if (categoriesResult.error) throw categoriesResult.error;
      if (citiesResult.error) throw citiesResult.error;
      return {
        categories: z.array(categorySchema).parse(categoriesResult.data ?? []),
        cities: z.array(citySchema).parse(citiesResult.data ?? []),
      };
    },
  });
  useEffect(() => {
    if (!categorySlug && catalog.data?.categories.length)
      setCategorySlug(
        catalog.data.categories.find((item) => item.slug === 'general-handyman')?.slug ??
          catalog.data.categories[0]?.slug ??
          '',
      );
    if (!cityCode && catalog.data?.cities.length)
      setCityCode(
        catalog.data.cities.find((item) => item.code === 'riyadh')?.code ??
          catalog.data.cities[0]?.code ??
          '',
      );
  }, [catalog.data, categorySlug, cityCode]);
  const canPublish = useMemo(
    () =>
      title.trim().length >= 3 &&
      summary.trim().length >= 10 &&
      coordinates !== null &&
      categorySlug.length > 0 &&
      cityCode.length > 0 &&
      approved,
    [title, summary, coordinates, categorySlug, cityCode, approved],
  );
  useEffect(() => {
    if (recorderState.isRecording && recorderState.durationMillis >= MAX_RECORDING_MS)
      void stopRecording();
  }, [recorderState.durationMillis, recorderState.isRecording]);
  function invalidateApproval() {
    setApproved(false);
  }
  async function uploadPrivate(
    uri: string,
    filename: string,
    mimeType: string,
    purpose: 'request_media' | 'request_audio',
  ) {
    const response = await fetch(uri);
    if (!response.ok) throw new Error('LOCAL_MEDIA_READ_FAILED');
    const bytes = new Uint8Array(await response.arrayBuffer());
    return await secureUpload({ bytes, filename, mimeType, purpose });
  }
  async function pickImage() {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      quality: 0.72,
      exif: false,
    });
    if (result.canceled) return;
    const asset = result.assets[0];
    if (!asset) return;
    if (
      (asset.fileSize ?? 0) > MAX_MEDIA_BYTES ||
      !(asset.mimeType ?? 'image/jpeg').match(/^image\/(jpeg|png|webp)$/)
    ) {
      Alert.alert(t('unsupportedFileTitle'), t('unsupportedRequestMedia'));
      return;
    }
    setImage(asset);
    invalidateApproval();
  }
  async function locate() {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) {
      setError(t('locationPermissionDenied'));
      return;
    }
    const current = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.Balanced,
    });
    setCoordinates({ latitude: current.coords.latitude, longitude: current.coords.longitude });
    invalidateApproval();
  }
  async function startRecording() {
    const permission = await AudioModule.requestRecordingPermissionsAsync();
    if (!permission.granted) {
      setError(t('microphonePermissionDenied'));
      return;
    }
    await setAudioModeAsync({
      allowsRecording: true,
      playsInSilentMode: true,
      allowsBackgroundRecording: false,
    });
    await recorder.prepareToRecordAsync();
    recorder.record();
  }
  async function stopRecording() {
    await recorder.stop();
    await setAudioModeAsync({ allowsRecording: false });
    if (!recorder.uri) return;
    try {
      const upload = await uploadPrivate(
        recorder.uri,
        `${globalThis.crypto.randomUUID()}.m4a`,
        'audio/mp4',
        'request_audio',
      );
      const raw: unknown = await supabase.functions.invoke<unknown>('transcribe', {
        body: { storagePath: upload.storagePath, locale },
      });
      const invoked = functionResultSchema.parse(raw);
      const transcript = z.object({ transcript: z.string() }).safeParse(invoked.data);
      if (invoked.error || !transcript.success) throw new Error('TRANSCRIPTION_FAILED');
      setDescription((current) =>
        current ? `${current}\n${transcript.data.transcript}` : transcript.data.transcript,
      );
      invalidateApproval();
    } catch {
      setError(t('transcriptionFailed'));
    }
  }
  async function analyze() {
    if (description.trim().length < 10) {
      setError(t('descriptionTooShort'));
      return;
    }
    setBusy(true);
    setError('');
    const fallback = new DeterministicAiProvider();
    try {
      const raw: unknown = await supabase.functions.invoke<unknown>('ai-diagnostic', {
        body: { messages: [{ role: 'user', text: description }], locale },
      });
      const invoked = functionResultSchema.parse(raw);
      const result = invoked.error
        ? await fallback.diagnose({
            locale,
            messages: [{ role: 'user', text: description }],
            categoryHints: catalog.data?.categories.map((item) => item.slug) ?? [],
          })
        : aiDiagnosticSchema.parse(invoked.data);
      setDiagnostic(result);
      setTitle(result.customerSummary.slice(0, 120));
      setSummary(result.customerSummary);
      setUrgency(result.urgencySuggestion);
      if (
        result.suggestedCategorySlug &&
        catalog.data?.categories.some((item) => item.slug === result.suggestedCategorySlug)
      )
        setCategorySlug(result.suggestedCategorySlug);
    } catch {
      const result = await fallback.diagnose({
        locale,
        messages: [{ role: 'user', text: description }],
        categoryHints: catalog.data?.categories.map((item) => item.slug) ?? [],
      });
      setDiagnostic(result);
      setTitle(result.customerSummary.slice(0, 120));
      setSummary(result.customerSummary);
      setError(t('aiUnavailableDraftCreated'));
    } finally {
      invalidateApproval();
      setBusy(false);
    }
  }
  async function publish() {
    if (!canPublish) return;
    setBusy(true);
    setError('');
    try {
      const media: Array<{ storage_path: string; mime_type: string; size: number }> = [];
      if (image) {
        const extension =
          image.mimeType === 'image/png' ? 'png' : image.mimeType === 'image/webp' ? 'webp' : 'jpg';
        const upload = await uploadPrivate(
          image.uri,
          `${globalThis.crypto.randomUUID()}.${extension}`,
          image.mimeType ?? 'image/jpeg',
          'request_media',
        );
        media.push({
          storage_path: upload.storagePath,
          mime_type: upload.mimeType,
          size: upload.sizeBytes,
        });
      }
      const now = Date.now();
      const requestedStart =
        schedule === 'today'
          ? new Date(now + 60 * 60 * 1000).toISOString()
          : schedule === 'asap'
            ? new Date(now).toISOString()
            : null;
      const { data, error: rpcError } = await supabase.rpc('publish_service_request', {
        payload: {
          title: title.trim(),
          original_text: description,
          structured_description: summary,
          urgency,
          locale,
          category_slug: categorySlug,
          city_code: cityCode,
          requested_start: requestedStart,
          schedule_preference: schedule,
          exact_location: coordinates,
          media,
          customer_approved: true,
          ai_diagnostic: diagnostic,
          idempotency_key: globalThis.crypto.randomUUID(),
        },
      });
      if (rpcError) throw rpcError;
      Alert.alert(
        t('requestPublishedTitle'),
        t('requestNumber', { id: z.string().uuid().parse(data) }),
      );
    } catch {
      setError(t('publishOrUploadFailed'));
    } finally {
      setBusy(false);
    }
  }
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Screen>
        <Text style={styles.title}>{t('describeProblem')}</Text>
        <Text style={styles.lead}>{t('aiDisclaimer')}</Text>
        <TextInput
          style={[styles.input, { minHeight: 130, textAlignVertical: 'top' }]}
          multiline
          value={description}
          maxLength={8000}
          onChangeText={(value) => {
            setDescription(value);
            invalidateApproval();
          }}
          placeholder={t('problemDescriptionPlaceholder')}
        />
        <View style={styles.row}>
          <Button
            kind="secondary"
            label={image ? t('changePhoto') : t('addPhoto')}
            onPress={() => void pickImage()}
          />
          <Button
            kind="secondary"
            label={
              recorderState.isRecording
                ? t('stopRecordingSeconds', {
                    seconds: Math.ceil(recorderState.durationMillis / 1000),
                  })
                : t('recordVoice')
            }
            onPress={() => void (recorderState.isRecording ? stopRecording() : startRecording())}
          />
          <Button
            kind="secondary"
            label={coordinates ? t('locationSelected') : t('chooseLocation')}
            onPress={() => void locate()}
          />
        </View>
        {image && (
          <Image
            source={{ uri: image.uri }}
            accessibilityLabel={t('attachedImageA11y')}
            style={{ width: '100%', height: 180, borderRadius: 16 }}
          />
        )}
        <Button
          disabled={busy}
          label={busy ? t('analyzing') : t('analyzeCreateDraft')}
          onPress={() => void analyze()}
        />
        {diagnostic && (
          <Card>
            {diagnostic.safetyFlags.length > 0 && (
              <Text style={styles.error}>
                {t('safetyTitle')}: {t('safetyGuidance')}
              </Text>
            )}
            <Text style={styles.badge}>
              {t('confidenceSummary', {
                confidence: Math.round(diagnostic.confidence * 100),
              })}{' '}
              · {diagnostic.metadata.fallback ? 'Fallback' : 'AI'}
            </Text>
            {diagnostic.followUpQuestions.map((question) => (
              <Text key={question} style={styles.lead}>
                • {question}
              </Text>
            ))}
          </Card>
        )}
        <TextInput
          style={styles.input}
          value={title}
          maxLength={120}
          onChangeText={(value) => {
            setTitle(value);
            invalidateApproval();
          }}
          placeholder={t('requestTitlePlaceholder')}
        />
        <TextInput
          style={[styles.input, { minHeight: 130, textAlignVertical: 'top' }]}
          multiline
          value={summary}
          maxLength={8000}
          onChangeText={(value) => {
            setSummary(value);
            invalidateApproval();
          }}
          placeholder={t('providerSummaryPlaceholder')}
        />
        <Text style={styles.lead}>{t('editableAiCategory')}</Text>
        <View style={styles.row}>
          {catalog.data?.categories.map((category) => (
            <Button
              key={category.slug}
              kind={categorySlug === category.slug ? 'primary' : 'secondary'}
              label={category.service_category_translations[0]?.name ?? category.slug}
              onPress={() => {
                setCategorySlug(category.slug);
                invalidateApproval();
              }}
            />
          ))}
        </View>
        <Text style={styles.lead}>{t('city')}</Text>
        <View style={styles.row}>
          {catalog.data?.cities.map((city) => (
            <Button
              key={city.code}
              kind={cityCode === city.code ? 'primary' : 'secondary'}
              label={locale === 'ar' ? city.name_ar : city.name_en}
              onPress={() => {
                setCityCode(city.code);
                invalidateApproval();
              }}
            />
          ))}
        </View>
        <Text style={styles.lead}>{t('priority')}</Text>
        <View style={styles.row}>
          {(['flexible', 'normal', 'urgent'] as const).map((value) => (
            <Button
              key={value}
              kind={urgency === value ? 'primary' : 'secondary'}
              label={
                value === 'flexible'
                  ? t('priorityFlexible')
                  : value === 'normal'
                    ? t('priorityNormal')
                    : t('priorityUrgent')
              }
              onPress={() => {
                setUrgency(value);
                invalidateApproval();
              }}
            />
          ))}
        </View>
        <Text style={styles.lead}>{t('preferredTiming')}</Text>
        <View style={styles.row}>
          {(['asap', 'today', 'flexible'] as const).map((value) => (
            <Button
              key={value}
              kind={schedule === value ? 'primary' : 'secondary'}
              label={
                value === 'asap'
                  ? t('timingAsap')
                  : value === 'today'
                    ? t('timingToday')
                    : t('timingFlexible')
              }
              onPress={() => {
                setSchedule(value);
                invalidateApproval();
              }}
            />
          ))}
        </View>
        <Card>
          <Text style={styles.lead}>{t('draftReviewNotice')}</Text>
          <Button
            kind={approved ? 'primary' : 'secondary'}
            label={approved ? t('draftApproved') : t('approveDraftPublish')}
            onPress={() => setApproved((value) => !value)}
          />
        </Card>
        {error && (
          <Text accessibilityLiveRegion="polite" style={styles.error}>
            {error}
          </Text>
        )}
        <Button
          disabled={!canPublish || busy}
          label={t('publishRequest')}
          onPress={() => void publish()}
        />
      </Screen>
    </ScrollView>
  );
}
