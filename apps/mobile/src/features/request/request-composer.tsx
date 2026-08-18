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
  categorySelectionSource as resolveCategorySelectionSource,
  conversationOriginalText,
  type ConversationMessage,
} from './conversation-state';
import { ConversationTimeline } from './conversation-timeline';
import {
  appendTemporaryFallback,
  clearAiIntakeAbandonment,
  clearAiIntakeSnapshot,
  enqueuePendingTurn,
  loadAiIntakeSnapshot,
  queueAiIntakeAbandonment,
  reconcileAuthoritativeTurn,
  replayPendingTurns,
  retryFailedTranscriptionTurns,
  saveAiIntakeSnapshot,
  takeAiIntakeAbandonment,
  type PendingCustomerTurn,
} from './conversation-recovery';
import { isNetworkOnline } from '@/features/connectivity/network-state';
import {
  clearRetainedMedia,
  listRetainedMedia,
  removeRetainedMedia,
  retainPrivateMedia,
  type RetainedMedia,
} from '@/lib/durable-media';
import { executeJournaledMutation } from '@/lib/mutation-journal';
import {
  activeMediaIdsAfterReplacement,
  bindingsForActiveTurn,
  collectRequestMediaUploadIds,
} from './turn-media';

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
  const [suggestedCategorySlug, setSuggestedCategorySlug] = useState('');
  const [selectedCategorySlug, setSelectedCategorySlug] = useState('');
  const [categoryConfirmedByUser, setCategoryConfirmedByUser] = useState(false);
  const [categorySelectionSource, setCategorySelectionSource] = useState<
    'ai_suggestion' | 'customer_correction' | 'manual' | null
  >(null);
  const [cityCode, setCityCode] = useState('');
  const [urgency, setUrgency] = useState<'flexible' | 'normal' | 'urgent' | 'safety_critical'>(
    'normal',
  );
  const [schedule, setSchedule] = useState<'asap' | 'scheduled' | 'flexible'>('flexible');
  const [approved, setApproved] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [pendingTurns, setPendingTurns] = useState<PendingCustomerTurn[]>([]);
  const [retainedMedia, setRetainedMedia] = useState<RetainedMedia[]>([]);
  const [activeImageMediaId, setActiveImageMediaId] = useState<string | null>(null);
  const [activeVoiceMediaId, setActiveVoiceMediaId] = useState<string | null>(null);
  const [requestMediaUploadIds, setRequestMediaUploadIds] = useState<string[]>([]);
  const [restored, setRestored] = useState(false);
  const sessionIdRef = useRef<string | null>(null);
  const replayingRef = useRef(false);
  const replaySignatureRef = useRef('');
  const reconnectRestoredRef = useRef(false);
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
        setSuggestedCategorySlug(local.draft.suggestedCategorySlug);
        setSelectedCategorySlug(local.draft.selectedCategorySlug);
        setCategoryConfirmedByUser(local.draft.categoryConfirmedByUser);
        setCategorySelectionSource(local.draft.categorySelectionSource);
        setCityCode(local.draft.cityCode);
        setUrgency(local.draft.urgency);
        setSchedule(local.draft.schedule);
        setCoordinates(local.draft.coordinates);
        setImageUpload(local.draft.imageUpload);
        setVoiceUpload(local.draft.voiceUpload);
        setRetainedMedia(local.draft.retainedMedia);
        setActiveImageMediaId(local.draft.activeImageMediaId);
        setActiveVoiceMediaId(local.draft.activeVoiceMediaId);
        setRequestMediaUploadIds(local.draft.requestMediaUploadIds);
        const restoredDiagnostic = aiDiagnosticSchema.safeParse(local.draft.diagnostic);
        if (restoredDiagnostic.success) setDiagnostic(restoredDiagnostic.data);
      }
      const durable = await listRetainedMedia(data.user.id);
      if (active) setRetainedMedia(durable);
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
    if (!online) {
      reconnectRestoredRef.current = false;
      return;
    }
    if (!restored || !userId || reconnectRestoredRef.current) return;
    reconnectRestoredRef.current = true;
    void (async () => {
      const abandonedSessionId = await takeAiIntakeAbandonment(userId);
      if (abandonedSessionId) {
        const { error: abandonError } = await supabase.rpc('abandon_ai_intake_session', {
          p_session_id: abandonedSessionId,
        });
        if (!abandonError) await clearAiIntakeAbandonment(userId);
      }
      const response = await (
        supabase.rpc as unknown as (name: string) => Promise<{ data: unknown; error: unknown }>
      )('restore_active_ai_intake');
      const server = restoredSessionSchema.safeParse(response.data);
      if (response.error || !server.success || !server.data.session) return;
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
      setConversation((current) => [
        ...authoritative,
        ...current.filter(
          (message) => message.clientMessageId && !authoritativeIds.has(message.clientMessageId),
        ),
      ]);
      setPendingTurns((current) =>
        current.filter((turn) => !authoritativeIds.has(turn.clientMessageId)),
      );
      const latest = aiDiagnosticSchema.safeParse(server.data.latestDiagnostic?.output);
      if (latest.success) setDiagnostic(latest.data);
    })();
  }, [online, restored, userId]);

  useEffect(() => {
    if (!restored || !userId) return;
    const timer = setTimeout(() => {
      void saveAiIntakeSnapshot(userId, {
        version: 2,
        sessionId,
        conversation,
        pendingTurns,
        draft: {
          description,
          title,
          summary,
          suggestedCategorySlug,
          selectedCategorySlug,
          categoryConfirmedByUser,
          categorySelectionSource,
          cityCode,
          urgency,
          schedule,
          coordinates,
          diagnostic,
          imageUpload,
          voiceUpload,
          retainedMedia,
          activeImageMediaId,
          activeVoiceMediaId,
          requestMediaUploadIds,
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
    suggestedCategorySlug,
    selectedCategorySlug,
    categoryConfirmedByUser,
    categorySelectionSource,
    cityCode,
    urgency,
    schedule,
    coordinates,
    diagnostic,
    imageUpload,
    voiceUpload,
    retainedMedia,
    activeImageMediaId,
    activeVoiceMediaId,
    requestMediaUploadIds,
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
    if (!cityCode && catalog.data?.cities.length)
      setCityCode(
        catalog.data.cities.find((item) => item.code === 'riyadh')?.code ??
          catalog.data.cities[0]?.code ??
          '',
      );
  }, [catalog.data, cityCode]);
  const canPublish = useMemo(
    () =>
      pendingTurns.length === 0 &&
      canPublishRequest({
        title,
        summary,
        coordinates,
        categorySlug: selectedCategorySlug,
        categoryConfirmedByUser,
        cityCode,
        approved,
      }),
    [
      title,
      summary,
      coordinates,
      selectedCategorySlug,
      categoryConfirmedByUser,
      cityCode,
      approved,
      pendingTurns.length,
    ],
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
    if (!userId) {
      setError(t('authRequired'));
      return;
    }
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
    try {
      const extension =
        asset.mimeType === 'image/png' ? 'png' : asset.mimeType === 'image/webp' ? 'webp' : 'jpg';
      const retained = await retainPrivateMedia({
        userId,
        kind: 'image',
        sourceUri: asset.uri,
        filename: asset.fileName ?? `${globalThis.crypto.randomUUID()}.${extension}`,
        mimeType: asset.mimeType ?? 'image/jpeg',
        sizeBytes: asset.fileSize,
      });
      const superseded = activeMediaIdsAfterReplacement({
        kind: 'image',
        activeImageMediaId,
        activeVoiceMediaId,
      });
      if (superseded.length) await removeRetainedMedia(userId, superseded);
      setRetainedMedia((current) => [
        ...current.filter((item) => !superseded.includes(item.id)),
        retained,
      ]);
      setActiveImageMediaId(retained.id);
      setImage({ ...asset, uri: retained.localUri });
      setImageUpload(null);
      invalidateApproval();
    } catch {
      setError(t('publishOrUploadFailed'));
    }
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
    if (!recorder.uri || !userId) return;
    try {
      const retained = await retainPrivateMedia({
        userId,
        kind: 'voice',
        sourceUri: recorder.uri,
        filename: `${globalThis.crypto.randomUUID()}.m4a`,
        mimeType: 'audio/mp4',
      });
      const superseded = activeMediaIdsAfterReplacement({
        kind: 'voice',
        activeImageMediaId,
        activeVoiceMediaId,
      });
      if (superseded.length) await removeRetainedMedia(userId, superseded);
      setRetainedMedia((current) => [
        ...current.filter((item) => !superseded.includes(item.id)),
        retained,
      ]);
      setActiveVoiceMediaId(retained.id);
      setVoiceUpload(null);
      invalidateApproval();
      if (!online) setError(t('aiUnavailableDraftCreated'));
    } catch {
      setError(t('transcriptionFailed'));
    }
  }

  async function prepareQueuedTurn(turn: PendingCustomerTurn): Promise<PendingCustomerTurn> {
    const bindings =
      turn.mediaBindings.length > 0
        ? [...turn.mediaBindings]
        : turn.localMediaIds.map((localMediaId) => {
            const media = retainedMedia.find((item) => item.id === localMediaId);
            if (!media) throw new Error('RETAINED_MEDIA_MISSING');
            const upload =
              localMediaId === activeImageMediaId
                ? imageUpload
                : localMediaId === activeVoiceMediaId
                  ? voiceUpload
                  : null;
            return { localMediaId, kind: media.kind, upload };
          });
    const uploads = [...turn.mediaUploadIds];
    for (let index = 0; index < bindings.length; index += 1) {
      const binding = bindings[index];
      if (!binding) continue;
      const media = retainedMedia.find((item) => item.id === binding.localMediaId);
      if (!media) throw new Error('RETAINED_MEDIA_MISSING');
      const upload =
        binding.upload ??
        (await uploadPrivate(
          media.localUri,
          media.filename,
          media.mimeType,
          media.kind === 'image' ? 'request_media' : 'request_audio',
        ));
      bindings[index] = { ...binding, upload };
      if (!uploads.includes(upload.uploadId)) uploads.push(upload.uploadId);
    }
    let prepared: PendingCustomerTurn = {
      ...turn,
      mediaUploadIds: uploads,
      mediaBindings: bindings,
    };
    setRequestMediaUploadIds((current) => collectRequestMediaUploadIds(current, bindings));
    setPendingTurns((current) =>
      current.map((item) => (item.clientMessageId === turn.clientMessageId ? prepared : item)),
    );
    if (prepared.inputKind === 'voice' && prepared.transcriptionStatus !== 'completed') {
      const voiceStoragePath = bindings.find((binding) => binding.kind === 'voice')?.upload
        ?.storagePath;
      if (!voiceStoragePath) throw new Error('VOICE_UPLOAD_REQUIRED');
      const raw: unknown = await supabase.functions.invoke<unknown>('transcribe', {
        body: { storagePath: voiceStoragePath, locale, clientMessageId: prepared.clientMessageId },
      });
      const invoked = functionResultSchema.parse(raw);
      const parsed = z.object({ transcript: z.string().min(1) }).safeParse(invoked.data);
      if (invoked.error || !parsed.success) {
        prepared = { ...prepared, transcriptionStatus: 'retryable' };
        setPendingTurns((current) =>
          current.map((item) => (item.clientMessageId === turn.clientMessageId ? prepared : item)),
        );
        throw new Error('TRANSCRIPTION_RETRY_REQUIRED');
      }
      prepared = {
        ...prepared,
        transcript: parsed.data.transcript,
        transcriptionStatus: 'completed',
        text: prepared.text.trim()
          ? `${prepared.text.trim()}\n${parsed.data.transcript}`
          : parsed.data.transcript,
      };
    }
    setPendingTurns((current) =>
      current.map((item) => (item.clientMessageId === turn.clientMessageId ? prepared : item)),
    );
    return prepared;
  }

  async function invokeQueuedTurn(
    queuedTurn: PendingCustomerTurn,
  ): Promise<{ diagnostic: AiDiagnostic; turn: PendingCustomerTurn }> {
    const turn = await prepareQueuedTurn(queuedTurn);
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
    return { diagnostic: result, turn };
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
      setSuggestedCategorySlug(result.suggestedCategorySlug);
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
          applyDiagnosticResult(completed.value.turn, completed.value.diagnostic, true);
        }
        const completedIds = new Set(
          replayed.completed.map((completed) => completed.turn.clientMessageId),
        );
        setPendingTurns((current) =>
          current.filter((turn) => !completedIds.has(turn.clientMessageId)),
        );
        if (replayed.pending.length) {
          setError(
            replayed.pending.some((turn) => turn.inputKind === 'voice')
              ? t('transcriptionFailed')
              : t('aiUnavailableDraftCreated'),
          );
        } else setError('');
      })
      .finally(() => {
        replayingRef.current = false;
        setBusy(false);
      });
  }, [restored, online, busy, pendingTurns]);

  function retryFailedTranscriptions() {
    replaySignatureRef.current = '';
    setPendingTurns(retryFailedTranscriptionTurns);
    setError('');
  }

  async function analyze(summaryRequested = false) {
    const activeBindings = bindingsForActiveTurn({
      retainedMedia,
      activeImageMediaId,
      activeVoiceMediaId,
      imageUpload,
      voiceUpload,
    });
    const hasVoice = activeBindings.some((binding) => binding.kind === 'voice');
    const hasImage = activeBindings.some((binding) => binding.kind === 'image');
    const userText = description.trim() || (summaryRequested ? t('summaryRequestMessage') : '');
    if (userText.length < 10 && !hasVoice) {
      setError(t('descriptionTooShort'));
      return;
    }
    setBusy(true);
    setError('');
    const fallback = new DeterministicAiProvider();
    const nextConversation = [...conversation, { role: 'user' as const, text: userText }];
    let turn: PendingCustomerTurn | null = null;
    try {
      const mediaUploadIds = activeBindings.flatMap((binding) =>
        binding.upload ? [binding.upload.uploadId] : [],
      );
      turn = {
        clientMessageId: globalThis.crypto.randomUUID(),
        text: userText,
        inputKind: hasVoice ? 'voice' : hasImage ? 'image' : 'text',
        mediaUploadIds,
        localMediaIds: activeBindings.map((binding) => binding.localMediaId),
        mediaBindings: activeBindings,
        transcript: null,
        transcriptionStatus: hasVoice ? 'pending' : 'none',
        confirmedCategorySlug:
          categoryConfirmedByUser && selectedCategorySlug ? selectedCategorySlug : null,
        summaryRequested,
        createdAt: new Date().toISOString(),
      };
      const queued = enqueuePendingTurn(pendingTurns, turn);
      setPendingTurns(queued);
      const nextRequestMediaUploadIds = collectRequestMediaUploadIds(
        requestMediaUploadIds,
        activeBindings,
      );
      setRequestMediaUploadIds(nextRequestMediaUploadIds);
      setActiveImageMediaId(null);
      setActiveVoiceMediaId(null);
      setImage(null);
      setImageUpload(null);
      setVoiceUpload(null);
      if (userId) {
        await saveAiIntakeSnapshot(userId, {
          version: 2,
          sessionId,
          conversation,
          pendingTurns: queued,
          draft: {
            description,
            title,
            summary,
            suggestedCategorySlug,
            selectedCategorySlug,
            categoryConfirmedByUser,
            categorySelectionSource,
            cityCode,
            urgency,
            schedule,
            coordinates,
            diagnostic,
            imageUpload: null,
            voiceUpload: null,
            retainedMedia,
            activeImageMediaId: null,
            activeVoiceMediaId: null,
            requestMediaUploadIds: nextRequestMediaUploadIds,
          },
        });
      }
      if (!online) throw new Error('OFFLINE_TURN_QUEUED');
      const result = await invokeQueuedTurn(turn);
      applyDiagnosticResult(result.turn, result.diagnostic, true);
      setPendingTurns((current) =>
        current.filter((item) => item.clientMessageId !== turn!.clientMessageId),
      );
      setDescription('');
    } catch {
      if (!online && turn?.inputKind === 'voice') {
        setDescription('');
        setError(t('aiUnavailableDraftCreated'));
        return;
      }
      if (turn?.inputKind === 'voice' && turn.transcriptionStatus !== 'completed') {
        setError(t('transcriptionFailed'));
        return;
      }
      const result = await fallback.diagnose({
        locale,
        messages: nextConversation,
        categoryHints: catalog.data?.categories.map((item) => item.slug) ?? [],
        confirmedCategorySlug:
          categoryConfirmedByUser && selectedCategorySlug ? selectedCategorySlug : null,
        summaryRequested,
      });
      const fallbackTurn = turn ?? {
        clientMessageId: globalThis.crypto.randomUUID(),
        text: userText,
        inputKind: hasVoice
          ? ('voice' as const)
          : hasImage
            ? ('image' as const)
            : ('text' as const),
        mediaUploadIds: activeBindings.flatMap((binding) =>
          binding.upload ? [binding.upload.uploadId] : [],
        ),
        localMediaIds: activeBindings.map((binding) => binding.localMediaId),
        mediaBindings: activeBindings,
        transcript: null,
        transcriptionStatus: hasVoice ? ('pending' as const) : ('none' as const),
        confirmedCategorySlug:
          categoryConfirmedByUser && selectedCategorySlug ? selectedCategorySlug : null,
        summaryRequested,
        createdAt: new Date().toISOString(),
      };
      setPendingTurns((current) => enqueuePendingTurn(current, fallbackTurn));
      applyDiagnosticResult(fallbackTurn, result, false);
      setDescription('');
      setError(t('aiUnavailableDraftCreated'));
    } finally {
      invalidateApproval();
      setBusy(false);
    }
  }
  async function publish() {
    if (!canPublish || !userId || !categorySelectionSource) return;
    setBusy(true);
    setError('');
    try {
      const activeBindings = bindingsForActiveTurn({
        retainedMedia,
        activeImageMediaId,
        activeVoiceMediaId,
        imageUpload,
        voiceUpload,
      });
      const publicationMedia = await prepareQueuedTurn({
        clientMessageId: `publication-media:${userId}`,
        text: 'publication media',
        inputKind: 'text',
        mediaUploadIds: requestMediaUploadIds,
        localMediaIds: activeBindings.map((binding) => binding.localMediaId),
        mediaBindings: activeBindings,
        transcript: null,
        transcriptionStatus: 'none',
        confirmedCategorySlug: selectedCategorySlug,
        summaryRequested: false,
        createdAt: new Date().toISOString(),
      });
      const media = [...new Set(publicationMedia.mediaUploadIds)].map((uploadId) => ({
        upload_id: uploadId,
      }));
      const now = Date.now();
      const requestedStart =
        schedule === 'scheduled'
          ? new Date(now + 60 * 60 * 1000).toISOString()
          : schedule === 'asap'
            ? new Date(now).toISOString()
            : null;
      const requestedEnd = requestedStart
        ? new Date(Date.parse(requestedStart) + 60 * 60 * 1000).toISOString()
        : null;
      const publicationPayload = {
        title: title.trim(),
        original_text: conversationOriginalText([
          ...conversation,
          ...(description.trim() ? [{ role: 'user' as const, text: description.trim() }] : []),
        ]),
        structured_description: summary,
        urgency,
        locale,
        selected_category_slug: selectedCategorySlug,
        suggested_category_slug: suggestedCategorySlug || null,
        category_confirmed_by_user: categoryConfirmedByUser,
        category_selection_source: categorySelectionSource,
        city_code: cityCode,
        requested_start: requestedStart,
        requested_end: requestedEnd,
        schedule_preference: schedule,
        timing_mode: schedule,
        exact_location: coordinates,
        media,
        customer_approved: true,
        ai_diagnostic: diagnostic,
        ai_session_id: sessionId,
      };
      const requestId = await executeJournaledMutation({
        userId,
        operation: 'publish_request',
        entityKey: sessionId ?? 'manual-draft',
        payload: publicationPayload,
        execute: async (idempotencyKey, persistedPayload) => {
          const authoritativePayload = z.record(z.string(), z.unknown()).parse(persistedPayload);
          const { data, error: rpcError } = await supabase.rpc('publish_service_request', {
            payload: { ...authoritativePayload, idempotency_key: idempotencyKey },
          });
          if (rpcError) throw rpcError;
          return z.string().uuid().parse(data);
        },
      });
      await clearAiIntakeSnapshot(userId);
      await clearRetainedMedia(userId);
      setRetainedMedia([]);
      setPendingTurns([]);
      setActiveImageMediaId(null);
      setActiveVoiceMediaId(null);
      setRequestMediaUploadIds([]);
      Alert.alert(t('requestPublishedTitle'), t('requestNumber', { id: requestId }));
    } catch {
      setError(t('publishOrUploadFailed'));
    } finally {
      setBusy(false);
    }
  }
  async function deleteDraft() {
    if (!userId) return;
    setBusy(true);
    setError('');
    try {
      const abandonedSessionId = sessionId;
      await clearAiIntakeSnapshot(userId);
      await clearRetainedMedia(userId);
      if (abandonedSessionId && online) {
        const { error: abandonError } = await supabase.rpc('abandon_ai_intake_session', {
          p_session_id: abandonedSessionId,
        });
        if (abandonError) throw abandonError;
      } else if (abandonedSessionId) {
        await queueAiIntakeAbandonment(userId, abandonedSessionId);
      }
      setConversation([]);
      setPendingTurns([]);
      setSessionId(null);
      sessionIdRef.current = null;
      setDescription('');
      setTitle('');
      setSummary('');
      setDiagnostic(null);
      setImage(null);
      setImageUpload(null);
      setVoiceUpload(null);
      setActiveImageMediaId(null);
      setActiveVoiceMediaId(null);
      setRequestMediaUploadIds([]);
      setCoordinates(null);
      setSuggestedCategorySlug('');
      setSelectedCategorySlug('');
      setCategoryConfirmedByUser(false);
      setCategorySelectionSource(null);
      setCityCode('');
      setUrgency('normal');
      setSchedule('flexible');
      setApproved(false);
      setRetainedMedia([]);
    } catch {
      setError(t('deleteDraftFailed'));
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
            label={activeImageMediaId ? t('changePhoto') : t('addPhoto')}
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
        {activeImageMediaId && (
          <Image
            source={{
              uri:
                image?.uri ??
                retainedMedia.find((item) => item.id === activeImageMediaId)?.localUri ??
                '',
            }}
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
        {suggestedCategorySlug && !categoryConfirmedByUser && (
          <Button
            kind="secondary"
            label={t('confirmSuggestedCategory')}
            onPress={() => {
              setSelectedCategorySlug(suggestedCategorySlug);
              setCategoryConfirmedByUser(true);
              setCategorySelectionSource('ai_suggestion');
              invalidateApproval();
            }}
          />
        )}
        {categoryConfirmedByUser && (
          <Text accessibilityLiveRegion="polite" style={styles.badge}>
            {t('categoryConfirmed')}
          </Text>
        )}
        <View style={styles.row}>
          {catalog.data?.categories.map((category) => (
            <Button
              key={category.slug}
              kind={selectedCategorySlug === category.slug ? 'primary' : 'secondary'}
              label={category.service_category_translations[0]?.name ?? category.slug}
              onPress={() => {
                setSelectedCategorySlug(category.slug);
                setCategoryConfirmedByUser(true);
                setCategorySelectionSource(
                  resolveCategorySelectionSource(category.slug, suggestedCategorySlug || null),
                );
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
          {(['asap', 'scheduled', 'flexible'] as const).map((value) => (
            <Button
              key={value}
              kind={schedule === value ? 'primary' : 'secondary'}
              label={
                value === 'asap'
                  ? t('timingAsap')
                  : value === 'scheduled'
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
        {pendingTurns.some((turn) => turn.transcriptionStatus === 'retryable') && (
          <Button
            kind="secondary"
            disabled={busy || !online}
            label={t('retryTranscription')}
            onPress={retryFailedTranscriptions}
          />
        )}
        <Button
          disabled={!canPublish || busy}
          label={t('publishRequest')}
          onPress={() => void publish()}
        />
        <Button
          disabled={busy || !userId}
          kind="secondary"
          label={t('deleteDraft')}
          onPress={() =>
            Alert.alert(t('deleteDraftTitle'), t('deleteDraftMessage'), [
              { text: t('cancel'), style: 'cancel' },
              { text: t('deleteDraft'), style: 'destructive', onPress: () => void deleteDraft() },
            ])
          }
        />
      </Screen>
    </ScrollView>
  );
}
