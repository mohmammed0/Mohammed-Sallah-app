import { useEffect, useMemo, useRef, useState } from 'react';
import { Alert, Image, ScrollView, Text, TextInput, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { useNetworkState } from 'expo-network';
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
import { secureUpload, type CleanUpload } from '@/lib/secure-upload';
import { useLocale } from '@/providers/locale-provider';
import {
  canPublishRequest,
  conversationOriginalText,
  type ConversationMessage,
} from './conversation-state';
import { ConversationTimeline } from './conversation-timeline';
import {
  appendTemporaryFallback,
  clearAiIntakeSnapshot,
  enqueuePendingTurn,
  loadAiIntakeSnapshot,
  reconcileAuthoritativeTurn,
  replayPendingTurns,
  saveAiIntakeSnapshot,
  type PendingCustomerTurn,
} from './conversation-recovery';
import { isNetworkOnline } from '@/features/connectivity/network-state';

const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const MAX_RECORDING_MS = 120_000;
const categorySchema = z.object({
  slug: z.string(),
  service_category_translations: z.array(z.object({ name: z.string() })),
});
const citySchema = z.object({ code: z.string(), name_ar: z.string(), name_en: z.string() });
const functionResultSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() });
const restoredSessionSchema = z.object({
  session: z.object({ id: z.uuid() }).nullable(),
  messages: z.array(
    z.object({
      id: z.uuid(),
      actor: z.enum(['user', 'assistant', 'system']),
      content: z.string(),
      sequenceNumber: z.number().int(),
      clientMessageId: z.string().nullable(),
      inReplyToMessageId: z.uuid().nullable(),
      mediaUploadIds: z.array(z.uuid()),
    }),
  ),
  latestDiagnostic: z.object({ output: z.unknown() }).nullable(),
});

export function RequestComposer() {
  const { locale, t } = useLocale();
  const networkState = useNetworkState();
  const online = isNetworkOnline(networkState);
  const [description, setDescription] = useState('');
  const [conversation, setConversation] = useState<ConversationMessage[]>([]);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [summary, setSummary] = useState('');
  const [diagnostic, setDiagnostic] = useState<AiDiagnostic | null>(null);
  const [image, setImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [imageUpload, setImageUpload] = useState<CleanUpload | null>(null);
  const [voiceUpload, setVoiceUpload] = useState<CleanUpload | null>(null);
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
  const [userId, setUserId] = useState<string | null>(null);
  const [pendingTurns, setPendingTurns] = useState<PendingCustomerTurn[]>([]);
  const [restored, setRestored] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const replayingRef = useRef(false);
  const replaySignatureRef = useRef('');
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const recorderState = useAudioRecorderState(recorder, 250);

  useEffect(() => {
    sessionIdRef.current = sessionId;
  }, [sessionId]);

  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.auth.getUser();
      if (!active || !data.user) {
        if (active) setRestored(true);
        return;
      }
      setUserId(data.user.id);
      const local = await loadAiIntakeSnapshot(data.user.id);
      if (!active) return;
      if (local) {
        setSessionId(local.sessionId);
        sessionIdRef.current = local.sessionId;
        setConversation(local.conversation);
        setPendingTurns(local.pendingTurns);
        setDescription(local.draft.description);
        setTitle(local.draft.title);
        setSummary(local.draft.summary);
        setCategorySlug(local.draft.categorySlug);
        setCityCode(local.draft.cityCode);
        setUrgency(local.draft.urgency);
        setSchedule(local.draft.schedule);
        setCoordinates(local.draft.coordinates);
        setImageUpload(local.draft.imageUpload);
        setVoiceUpload(local.draft.voiceUpload);
        const restoredDiagnostic = aiDiagnosticSchema.safeParse(local.draft.diagnostic);
        if (restoredDiagnostic.success) setDiagnostic(restoredDiagnostic.data);
      }
      if (online) {
        const response = await (
          supabase.rpc as unknown as (name: string) => Promise<{ data: unknown; error: unknown }>
        )('restore_active_ai_intake');
        const server = restoredSessionSchema.safeParse(response.data);
        if (!response.error && server.success && server.data.session) {
          setSessionId(server.data.session.id);
          sessionIdRef.current = server.data.session.id;
          const userClientByMessageId = new Map(
            server.data.messages
              .filter((message) => message.actor === 'user' && message.clientMessageId)
              .map((message) => [message.id, message.clientMessageId!]),
          );
          const authoritative = server.data.messages.flatMap<ConversationMessage>((message) => {
            if (message.actor === 'system') return [];
            const clientMessageId =
              message.actor === 'user'
                ? (message.clientMessageId ?? undefined)
                : message.inReplyToMessageId
                  ? userClientByMessageId.get(message.inReplyToMessageId)
                  : undefined;
            return [
              {
                role: message.actor,
                text: message.content,
                clientMessageId,
                authoritative: true,
                mediaUploadIds: message.mediaUploadIds,
              },
            ];
          });
          const authoritativeIds = new Set(
            authoritative.flatMap((message) =>
              message.clientMessageId ? [message.clientMessageId] : [],
            ),
          );
          const remaining = (local?.pendingTurns ?? []).filter(
            (turn) => !authoritativeIds.has(turn.clientMessageId),
          );
          const temporary = (local?.conversation ?? []).filter(
            (message) => message.clientMessageId && !authoritativeIds.has(message.clientMessageId),
          );
          setConversation([...authoritative, ...temporary]);
          setPendingTurns(remaining);
          const latest = aiDiagnosticSchema.safeParse(server.data.latestDiagnostic?.output);
          if (latest.success) setDiagnostic(latest.data);
        }
      }
      setRestored(true);
    })();
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!restored || !userId) return;
    const timer = setTimeout(() => {
      void saveAiIntakeSnapshot(userId, {
        version: 1,
        sessionId,
        conversation,
        pendingTurns,
        draft: {
          description,
          title,
          summary,
          categorySlug,
          cityCode,
          urgency,
          schedule,
          coordinates,
          diagnostic,
          imageUpload,
          voiceUpload,
        },
      });
    }, 100);
    return () => clearTimeout(timer);
  }, [
    restored,
    userId,
    sessionId,
    conversation,
    pendingTurns,
    description,
    title,
    summary,
    categorySlug,
    cityCode,
    urgency,
    schedule,
    coordinates,
    diagnostic,
    imageUpload,
    voiceUpload,
  ]);
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
    () => canPublishRequest({ title, summary, coordinates, categorySlug, cityCode, approved }),
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
    setImageUpload(null);
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
      setVoiceUpload(upload);
      invalidateApproval();
    } catch {
      setError(t('transcriptionFailed'));
    }
  }

  async function invokeQueuedTurn(turn: PendingCustomerTurn): Promise<AiDiagnostic> {
    const raw: unknown = await supabase.functions.invoke<unknown>('ai-diagnostic', {
      body: {
        sessionId: sessionIdRef.current ?? undefined,
        clientMessageId: turn.clientMessageId,
        messages: [{ role: 'user', text: turn.text }],
        locale,
        categoryHints: catalog.data?.categories.map((item) => item.slug) ?? [],
        confirmedCategorySlug: turn.confirmedCategorySlug,
        summaryRequested: turn.summaryRequested,
        inputKind: turn.inputKind,
        mediaUploadIds: turn.mediaUploadIds,
      },
    });
    const invoked = functionResultSchema.parse(raw);
    if (invoked.error) throw new Error('AI_TURN_FAILED');
    const result = aiDiagnosticSchema.parse(invoked.data);
    if (result.metadata.sessionId) {
      sessionIdRef.current = result.metadata.sessionId;
      setSessionId(result.metadata.sessionId);
    }
    return result;
  }

  function applyDiagnosticResult(
    turn: PendingCustomerTurn,
    result: AiDiagnostic,
    authoritative: boolean,
  ) {
    const assistantText = result.followUpQuestions[0] ?? result.confirmationQuestion;
    setConversation((current) =>
      authoritative
        ? reconcileAuthoritativeTurn(current, turn, assistantText)
        : appendTemporaryFallback(current, turn, assistantText),
    );
    setDiagnostic(result);
    if (result.customerSummary) {
      setTitle(result.customerSummary.slice(0, 120));
      setSummary(result.customerSummary);
    }
    setUrgency(result.urgencySuggestion);
    if (
      result.suggestedCategorySlug &&
      catalog.data?.categories.some((item) => item.slug === result.suggestedCategorySlug)
    )
      setCategorySlug(result.suggestedCategorySlug);
  }

  useEffect(() => {
    if (!online) {
      replaySignatureRef.current = '';
      return;
    }
    if (!restored || busy || !pendingTurns.length || replayingRef.current) return;
    const signature = pendingTurns.map((turn) => turn.clientMessageId).join(':');
    if (signature === replaySignatureRef.current) return;
    replaySignatureRef.current = signature;
    replayingRef.current = true;
    setBusy(true);
    void replayPendingTurns(pendingTurns, invokeQueuedTurn)
      .then((replayed) => {
        for (const completed of replayed.completed) {
          applyDiagnosticResult(completed.turn, completed.value, true);
        }
        setPendingTurns(replayed.pending);
        if (replayed.pending.length) setError(t('aiUnavailableDraftCreated'));
        else setError('');
      })
      .finally(() => {
        replayingRef.current = false;
        setBusy(false);
      });
  }, [restored, online, busy, pendingTurns]);

  async function analyze(summaryRequested = false) {
    const userText = description.trim() || (summaryRequested ? t('summaryRequestMessage') : '');
    if (userText.length < 10) {
      setError(t('descriptionTooShort'));
      return;
    }
    setBusy(true);
    setError('');
    const fallback = new DeterministicAiProvider();
    const nextConversation = [...conversation, { role: 'user' as const, text: userText }];
    let turn: PendingCustomerTurn | null = null;
    try {
      let cleanImage = imageUpload;
      if (image && !cleanImage) {
        const extension =
          image.mimeType === 'image/png' ? 'png' : image.mimeType === 'image/webp' ? 'webp' : 'jpg';
        cleanImage = await uploadPrivate(
          image.uri,
          `${globalThis.crypto.randomUUID()}.${extension}`,
          image.mimeType ?? 'image/jpeg',
          'request_media',
        );
        setImageUpload(cleanImage);
      }
      const mediaUploadIds = [cleanImage?.uploadId, voiceUpload?.uploadId].filter(
        (value): value is string => Boolean(value),
      );
      turn = {
        clientMessageId: globalThis.crypto.randomUUID(),
        text: userText,
        inputKind: voiceUpload ? 'voice' : cleanImage ? 'image' : 'text',
        mediaUploadIds,
        confirmedCategorySlug: categorySlug || null,
        summaryRequested,
        createdAt: new Date().toISOString(),
      };
      const queued = enqueuePendingTurn(pendingTurns, turn);
      setPendingTurns(queued);
      if (userId) {
        await saveAiIntakeSnapshot(userId, {
          version: 1,
          sessionId,
          conversation,
          pendingTurns: queued,
          draft: {
            description,
            title,
            summary,
            categorySlug,
            cityCode,
            urgency,
            schedule,
            coordinates,
            diagnostic,
            imageUpload: cleanImage,
            voiceUpload,
          },
        });
      }
      if (!online) throw new Error('OFFLINE_TURN_QUEUED');
      const result = await invokeQueuedTurn(turn);
      applyDiagnosticResult(turn, result, true);
      setPendingTurns((current) =>
        current.filter((item) => item.clientMessageId !== turn!.clientMessageId),
      );
      setDescription('');
      setVoiceUpload(null);
    } catch {
      const result = await fallback.diagnose({
        locale,
        messages: nextConversation,
        categoryHints: catalog.data?.categories.map((item) => item.slug) ?? [],
        confirmedCategorySlug: categorySlug || null,
        summaryRequested,
      });
      const fallbackTurn = turn ?? {
        clientMessageId: globalThis.crypto.randomUUID(),
        text: userText,
        inputKind: 'text' as const,
        mediaUploadIds: [],
        confirmedCategorySlug: categorySlug || null,
        summaryRequested,
        createdAt: new Date().toISOString(),
      };
      setPendingTurns((current) => enqueuePendingTurn(current, fallbackTurn));
      applyDiagnosticResult(fallbackTurn, result, false);
      setDescription('');
      setVoiceUpload(null);
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
      if (image || imageUpload) {
        const extension =
          image?.mimeType === 'image/png'
            ? 'png'
            : image?.mimeType === 'image/webp'
              ? 'webp'
              : 'jpg';
        const upload =
          imageUpload ??
          (image
            ? await uploadPrivate(
                image.uri,
                `${globalThis.crypto.randomUUID()}.${extension}`,
                image.mimeType ?? 'image/jpeg',
                'request_media',
              )
            : null);
        if (!upload) throw new Error('RESTORED_MEDIA_MISSING');
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
          original_text: conversationOriginalText([
            ...conversation,
            ...(description.trim() ? [{ role: 'user' as const, text: description.trim() }] : []),
          ]),
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
          ai_session_id: sessionId,
          idempotency_key: globalThis.crypto.randomUUID(),
        },
      });
      if (rpcError) throw rpcError;
      const requestId = z.string().uuid().parse(data);
      if (sessionId) {
        const linked = await (
          supabase.rpc as unknown as (
            name: string,
            args: Record<string, unknown>,
          ) => Promise<{ error: unknown }>
        )('link_ai_session_to_request', {
          p_session_id: sessionId,
          p_request_id: requestId,
        });
        if (linked.error) setError(t('aiHistoryLinkFailed'));
      }
      if (userId) await clearAiIntakeSnapshot(userId);
      setPendingTurns([]);
      Alert.alert(t('requestPublishedTitle'), t('requestNumber', { id: requestId }));
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
        <ConversationTimeline
          messages={conversation}
          userLabel={t('you')}
          assistantLabel={t('assistant')}
        />
        <TextInput
          style={[styles.input, { minHeight: 130, textAlignVertical: 'top' }]}
          multiline
          value={description}
          maxLength={8000}
          onChangeText={(value) => {
            setDescription(value);
            invalidateApproval();
          }}
          placeholder={
            conversation.length
              ? t('answerFollowUpPlaceholder')
              : t('problemDescriptionPlaceholder')
          }
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
          onPress={() => void analyze(false)}
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
              · {diagnostic.metadata.fallback ? t('aiFallbackLabel') : t('aiProviderLabel')}
            </Text>
            {diagnostic.followUpQuestions.map((question) => (
              <Text key={question} style={styles.lead}>
                • {question}
              </Text>
            ))}
            {!diagnostic.enoughInformation && (
              <Button
                kind="secondary"
                label={t('createSummaryNow')}
                onPress={() => void analyze(true)}
              />
            )}
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
