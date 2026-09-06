import { useEffect, useMemo, useRef, useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useQuery } from '@tanstack/react-query';
import * as ImagePicker from 'expo-image-picker';
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
import {
  ActionButton,
  CustomerScreen,
  Field,
  LoadingBlock,
  Notice,
  Pill,
  StepHeader,
  Surface,
  customerStyles,
} from '@/design-system/primitives';
import { AppIcon, categoryIconName } from '@/design-system/icon';
import { customerTokens as tokens } from '@/design-system/tokens';
import { ChatComposer, MediaPreview, QuickReplyChip } from '@/design-system/customer-components';
import {
  logicalChevron,
  logicalRowStyle,
  logicalTextStyle,
  logicalWritingDirection,
} from '@/design-system/rtl';
import { supabase } from '@/lib/supabase';
import { secureUpload, type CleanUpload } from '@/lib/secure-upload';
import { useLocale } from '@/providers/locale-provider';
import {
  canPublishRequest,
  categorySelectionSource as resolveCategorySelectionSource,
  conversationOriginalText,
  markConversationMessageRetryable,
  updateConversationTranscript,
  upsertPendingCustomerMessage,
  type ConversationMessage,
} from './conversation-state';
import { ConversationTimeline } from './conversation-timeline';
import { AiDataConsentPanel } from './ai-data-consent-panel';
import { AiDataConsentRequiredError, createAiDataConsentGate } from './ai-data-consent';
import {
  appendTemporaryFallback,
  clearAiIntakeAbandonment,
  clearAiIntakeSnapshot,
  confirmTranscriptReview,
  enqueuePendingTurn,
  isTranscriptReviewRequiredError,
  loadAiIntakeSnapshot,
  queueAiIntakeAbandonment,
  reconcileAuthoritativeTurn,
  replayPendingTurns,
  retryFailedTranscriptionTurns,
  saveAiIntakeSnapshot,
  stageTranscriptReview,
  takeAiIntakeAbandonment,
  TranscriptReviewRequiredError,
  updateTranscriptReview,
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
import { useCustomerLocation } from '@/features/location/location-provider';
import { shouldOfferTransientSave } from '@/features/location/location-editor-state';
import { resolveServiceLocation } from '@/features/location/location-service';
import {
  buildRiyadhScheduleWindow,
  isRequestReadyForReview,
  publicationWindow,
  requestJourneyStepNumber,
  type RequestJourneyStep,
} from './request-journey';

const MAX_MEDIA_BYTES = 10 * 1024 * 1024;
const MAX_RECORDING_MS = 120_000;
const categorySchema = z.object({
  id: z.uuid(),
  slug: z.string(),
  icon_key: z.string(),
  service_category_translations: z.array(z.object({ name: z.string(), description: z.string() })),
});
const subcategorySchema = z.object({
  id: z.uuid(),
  category_id: z.uuid(),
  slug: z.string(),
  service_subcategory_translations: z.array(
    z.object({ name: z.string(), description: z.string() }),
  ),
});
const functionResultSchema = z.object({ data: z.unknown(), error: z.unknown().nullable() });
const transcriptionResultSchema = z.object({
  transcript: z.string().min(1).max(8_000),
  editable: z.literal(true),
  cached: z.boolean().optional(),
});
const transcriptionConfirmationSchema = z.object({
  transcript: z.string().min(1).max(8_000),
  editable: z.literal(true),
  confirmed: z.literal(true),
});
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
      inputKind: z.enum(['text', 'voice', 'image', 'system']),
    }),
  ),
  latestDiagnostic: z.object({ output: z.unknown() }).nullable(),
});

export function RequestComposer() {
  const { category: initialCategory } = useLocalSearchParams<{ category?: string }>();
  const { locale, t } = useLocale();
  const textDirection = logicalTextStyle(locale);
  const customerLocation = useCustomerLocation();
  const activeLocation = customerLocation.activeLocation;
  const coordinates = activeLocation?.coordinates ?? null;
  const selectedAddressId = activeLocation?.savedAddressId ?? null;
  const formattedAddress = activeLocation?.formattedAddress ?? '';
  const addressLabel = activeLocation?.label ?? '';
  const building = activeLocation?.building ?? '';
  const unit = activeLocation?.unit ?? '';
  const accessNotes = activeLocation?.accessNotes ?? '';
  const cityCode = activeLocation?.cityCode ?? '';
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
  const [suggestedCategorySlug, setSuggestedCategorySlug] = useState('');
  const [selectedCategorySlug, setSelectedCategorySlug] = useState('');
  const [selectedSubcategorySlug, setSelectedSubcategorySlug] = useState('');
  const [categoryConfirmedByUser, setCategoryConfirmedByUser] = useState(false);
  const [categorySelectionSource, setCategorySelectionSource] = useState<
    'ai_suggestion' | 'customer_correction' | 'manual' | null
  >(null);
  const [urgency, setUrgency] = useState<'flexible' | 'normal' | 'urgent' | 'safety_critical'>(
    'normal',
  );
  const [schedule, setSchedule] = useState<'asap' | 'scheduled' | 'flexible'>('flexible');
  const [approved, setApproved] = useState(false);
  const [journeyStep, setJourneyStep] = useState<RequestJourneyStep>('category');
  const [requestedStart, setRequestedStart] = useState<string | null>(null);
  const [requestedEnd, setRequestedEnd] = useState<string | null>(null);
  const [publishedRequestId, setPublishedRequestId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [userId, setUserId] = useState<string | null>(null);
  const [pendingTurns, setPendingTurns] = useState<PendingCustomerTurn[]>([]);
  const [retainedMedia, setRetainedMedia] = useState<RetainedMedia[]>([]);
  const [activeImageMediaId, setActiveImageMediaId] = useState<string | null>(null);
  const [activeVoiceMediaId, setActiveVoiceMediaId] = useState<string | null>(null);
  const [requestMediaUploadIds, setRequestMediaUploadIds] = useState<string[]>([]);
  const [restored, setRestored] = useState(false);
  const [aiConsentGranted, setAiConsentGranted] = useState(false);
  const [manualIntake, setManualIntake] = useState(false);
  const aiConsentGate = useRef(createAiDataConsentGate()).current;
  const recordingStartedRef = useRef(false);
  const sessionIdRef = useRef<string | null>(null);
  const replayingRef = useRef(false);
  const replaySignatureRef = useRef('');
  const reconnectRestoredRef = useRef(false);
  const chatScrollRef = useRef<ScrollView | null>(null);
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
        setSelectedSubcategorySlug(local.draft.selectedSubcategorySlug);
        setCategoryConfirmedByUser(local.draft.categoryConfirmedByUser);
        setCategorySelectionSource(local.draft.categorySelectionSource);
        setUrgency(local.draft.urgency);
        setSchedule(local.draft.schedule);
        if (local.draft.activeLocation?.savedAddressId) {
          await customerLocation.selectSavedAddress(local.draft.activeLocation.savedAddressId);
        } else if (local.draft.activeLocation) {
          customerLocation.selectTransientLocation(local.draft.activeLocation);
        } else if (local.draft.selectedAddressId) {
          await customerLocation.selectSavedAddress(local.draft.selectedAddressId);
        } else if (online && local.draft.coordinates) {
          try {
            const resolvedLocation = await resolveServiceLocation(local.draft.coordinates);
            if (resolvedLocation.status === 'supported') {
              customerLocation.selectTransientLocation({
                savedAddressId: null,
                label: local.draft.addressLabel || t('serviceLocation'),
                formattedAddress: local.draft.formattedAddress,
                building: local.draft.building || null,
                unit: local.draft.unit || null,
                accessNotes: local.draft.accessNotes || null,
                cityCode: resolvedLocation.city.code,
                cityNameAr: resolvedLocation.city.nameAr,
                cityNameEn: resolvedLocation.city.nameEn,
                coordinates: local.draft.coordinates,
              });
            }
          } catch {
            // Legacy drafts remain intact; the customer can reselect a verified location.
          }
        }
        setRequestedStart(local.draft.requestedStart);
        setRequestedEnd(local.draft.requestedEnd);
        setJourneyStep(
          local.draft.journeyStep === 'success' ? 'category' : local.draft.journeyStep,
        );
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
                delivery: 'sent',
                mediaUploadIds: message.mediaUploadIds,
                inputKind:
                  message.actor === 'user' && message.inputKind !== 'system'
                    ? message.inputKind
                    : undefined,
                transcriptStatus:
                  message.actor === 'user' && message.inputKind === 'voice'
                    ? 'completed'
                    : undefined,
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
            delivery: 'sent',
            mediaUploadIds: message.mediaUploadIds,
            inputKind:
              message.actor === 'user' && message.inputKind !== 'system'
                ? message.inputKind
                : undefined,
            transcriptStatus:
              message.actor === 'user' && message.inputKind === 'voice' ? 'completed' : undefined,
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
          selectedSubcategorySlug,
          categoryConfirmedByUser,
          categorySelectionSource,
          cityCode,
          urgency,
          schedule,
          coordinates,
          selectedAddressId,
          formattedAddress,
          addressLabel,
          building,
          unit,
          accessNotes,
          requestedStart,
          requestedEnd,
          journeyStep,
          diagnostic,
          imageUpload,
          voiceUpload,
          retainedMedia,
          activeImageMediaId,
          activeVoiceMediaId,
          requestMediaUploadIds,
          activeLocation,
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
    selectedSubcategorySlug,
    categoryConfirmedByUser,
    categorySelectionSource,
    cityCode,
    urgency,
    schedule,
    coordinates,
    selectedAddressId,
    formattedAddress,
    addressLabel,
    building,
    unit,
    accessNotes,
    requestedStart,
    requestedEnd,
    journeyStep,
    diagnostic,
    imageUpload,
    voiceUpload,
    retainedMedia,
    activeImageMediaId,
    activeVoiceMediaId,
    requestMediaUploadIds,
    activeLocation,
  ]);
  const catalog = useQuery({
    queryKey: ['request-catalog', locale],
    queryFn: async () => {
      const [categoriesResult, subcategoriesResult] = await Promise.all([
        supabase
          .from('service_categories')
          .select('id,slug,icon_key,service_category_translations(name,description)')
          .eq('service_category_translations.locale', locale)
          .eq('enabled', true)
          .order('sort_order'),
        supabase
          .from('service_subcategories')
          .select('id,category_id,slug,service_subcategory_translations(name,description)')
          .eq('service_subcategory_translations.locale', locale)
          .eq('enabled', true)
          .order('sort_order'),
      ]);
      if (categoriesResult.error) throw categoriesResult.error;
      if (subcategoriesResult.error) throw subcategoriesResult.error;
      return {
        categories: z.array(categorySchema).parse(categoriesResult.data ?? []),
        subcategories: z.array(subcategorySchema).parse(subcategoriesResult.data ?? []),
      };
    },
  });
  useEffect(() => {
    if (
      !selectedCategorySlug &&
      initialCategory &&
      catalog.data?.categories.some((item) => item.slug === initialCategory)
    ) {
      setSelectedCategorySlug(initialCategory);
      setCategoryConfirmedByUser(true);
      setCategorySelectionSource('manual');
    }
  }, [catalog.data, initialCategory, selectedCategorySlug]);
  const selectedCategory = catalog.data?.categories.find(
    (item) => item.slug === selectedCategorySlug,
  );
  const suggestedCategory = catalog.data?.categories.find(
    (item) => item.slug === suggestedCategorySlug,
  );
  const availableSubcategories = (catalog.data?.subcategories ?? []).filter(
    (item) => item.category_id === selectedCategory?.id,
  );
  useEffect(() => {
    if (
      selectedSubcategorySlug &&
      !availableSubcategories.some((item) => item.slug === selectedSubcategorySlug)
    )
      setSelectedSubcategorySlug('');
  }, [availableSubcategories, selectedSubcategorySlug]);
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
  const readyForReview = useMemo(
    () =>
      isRequestReadyForReview({
        selectedCategorySlug,
        categoryConfirmedByUser,
        title,
        summary,
        coordinates,
        cityCode,
        timingMode: schedule,
        requestedStart,
        requestedEnd,
        pendingTurnCount: pendingTurns.length,
      }),
    [
      selectedCategorySlug,
      categoryConfirmedByUser,
      title,
      summary,
      coordinates,
      cityCode,
      schedule,
      requestedStart,
      requestedEnd,
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
  useEffect(() => () => aiConsentGate.withdraw(), [aiConsentGate]);
  function allowAiData() {
    aiConsentGate.grant();
    setAiConsentGranted(true);
    setManualIntake(false);
    replaySignatureRef.current = '';
    setError('');
  }
  function withdrawAiData() {
    aiConsentGate.withdraw();
    if (recordingStartedRef.current || recorderState.isRecording) {
      void stopRecording().catch(() => setError(t('publishOrUploadFailed')));
    }
    setAiConsentGranted(false);
    replaySignatureRef.current = '';
  }
  function continueManually() {
    if (busy || pendingTurns.length > 0) return;
    withdrawAiData();
    setManualIntake(true);
    if (description.trim()) {
      if (!title.trim()) setTitle(description.trim().slice(0, 120));
      if (!summary.trim()) setSummary(description.trim());
    } else if (summary.trim()) setDescription(summary.trim());
    invalidateApproval();
  }
  async function uploadPrivate(
    uri: string,
    filename: string,
    mimeType: string,
    purpose: 'request_media' | 'request_audio',
    recoveryKey: string,
    forAi: boolean,
  ) {
    if (forAi) aiConsentGate.assertAllowed();
    const response = await fetch(uri);
    if (!response.ok) throw new Error('LOCAL_MEDIA_READ_FAILED');
    const bytes = new Uint8Array(await response.arrayBuffer());
    if (forAi) aiConsentGate.assertAllowed();
    return await secureUpload({ bytes, filename, mimeType, purpose, recoveryKey });
  }
  async function pickImage(source: 'camera' | 'library') {
    if (!userId) {
      setError(t('authRequired'));
      return;
    }
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setError(t('cameraPermissionDenied'));
        return;
      }
    }
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync({
            mediaTypes: ['images'],
            allowsEditing: true,
            quality: 0.72,
            exif: false,
          })
        : await ImagePicker.launchImageLibraryAsync({
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
  async function saveActiveTransientLocation() {
    if (!activeLocation || activeLocation.savedAddressId !== null) return;
    setBusy(true);
    setError('');
    try {
      await customerLocation.saveAddress({
        id: null,
        label: activeLocation.label,
        formattedAddress: activeLocation.formattedAddress,
        building: activeLocation.building ?? '',
        unit: activeLocation.unit ?? '',
        accessNotes: activeLocation.accessNotes ?? '',
        cityCode: activeLocation.cityCode,
        isDefault: customerLocation.loaded && customerLocation.addresses.length === 0,
        coordinates: activeLocation.coordinates,
      });
      setError(t('locationSaved'));
    } catch {
      setError(t('saveLocationFailed'));
    } finally {
      setBusy(false);
    }
  }
  async function startRecording() {
    try {
      aiConsentGate.assertAllowed();
      const permission = await AudioModule.requestRecordingPermissionsAsync();
      aiConsentGate.assertAllowed();
      if (!permission.granted) {
        setError(t('microphonePermissionDenied'));
        return;
      }
      await setAudioModeAsync({
        allowsRecording: true,
        playsInSilentMode: true,
        allowsBackgroundRecording: false,
      });
      aiConsentGate.assertAllowed();
      await recorder.prepareToRecordAsync();
      aiConsentGate.assertAllowed();
      recorder.record();
      recordingStartedRef.current = true;
    } catch (caught) {
      await setAudioModeAsync({ allowsRecording: false }).catch(() => undefined);
      setError(
        t(
          caught instanceof AiDataConsentRequiredError
            ? 'aiConsentRequired'
            : 'publishOrUploadFailed',
        ),
      );
    }
  }
  async function stopRecording() {
    recordingStartedRef.current = false;
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

  async function prepareQueuedTurn(
    turn: PendingCustomerTurn,
    forAi = true,
  ): Promise<PendingCustomerTurn> {
    if (forAi) aiConsentGate.assertAllowed();
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
          `request-media:${media.id}`,
          forAi,
        ));
      bindings[index] = { ...binding, upload };
      if (!uploads.includes(upload.uploadId)) uploads.push(upload.uploadId);
    }
    const prepared: PendingCustomerTurn = {
      ...turn,
      mediaUploadIds: uploads,
      mediaBindings: bindings,
    };
    setRequestMediaUploadIds((current) => collectRequestMediaUploadIds(current, bindings));
    setPendingTurns((current) =>
      current.map((item) => (item.clientMessageId === turn.clientMessageId ? prepared : item)),
    );
    setPendingTurns((current) =>
      current.map((item) => (item.clientMessageId === turn.clientMessageId ? prepared : item)),
    );
    return prepared;
  }

  async function invokeQueuedTurn(
    queuedTurn: PendingCustomerTurn,
  ): Promise<{ diagnostic: AiDiagnostic; turn: PendingCustomerTurn }> {
    aiConsentGate.assertAllowed();
    let turn = await prepareQueuedTurn(queuedTurn);
    aiConsentGate.assertAllowed();
    if (turn.inputKind === 'voice') {
      if (turn.transcriptionStatus === 'review') throw new TranscriptReviewRequiredError();
      const voiceUploadId = turn.mediaBindings.find((binding) => binding.kind === 'voice')?.upload
        ?.uploadId;
      if (!voiceUploadId) throw new Error('CLEAN_VOICE_UPLOAD_REQUIRED');
      if (turn.transcriptionStatus !== 'completed') {
        const transcriptionRaw: unknown = await supabase.functions.invoke<unknown>('transcribe', {
          body: {
            action: 'transcribe',
            uploadId: voiceUploadId,
            locale,
            clientMessageId: turn.clientMessageId,
          },
        });
        const transcriptionResponse = functionResultSchema.parse(transcriptionRaw);
        if (transcriptionResponse.error) throw new Error('TRANSCRIPTION_FAILED');
        const transcription = transcriptionResultSchema.parse(transcriptionResponse.data);
        turn = stageTranscriptReview(turn, transcription.transcript);
        setPendingTurns((current) =>
          current.map((item) => (item.clientMessageId === turn.clientMessageId ? turn : item)),
        );
        setConversation((current) =>
          updateConversationTranscript(
            current,
            turn.clientMessageId,
            turn.transcript ?? '',
            'review',
          ),
        );
        throw new TranscriptReviewRequiredError();
      }
    }
    aiConsentGate.assertAllowed();
    const raw: unknown = await supabase.functions.invoke<unknown>('ai-diagnostic', {
      body: {
        sessionId: sessionIdRef.current ?? undefined,
        clientMessageId: turn.clientMessageId,
        messages: [{ role: 'user', text: turn.text }],
        locale,
        categoryHints: catalog.data?.categories.map((item) => item.slug) ?? [],
        confirmedCategorySlug: turn.confirmedCategorySlug,
        confirmedSubcategorySlug: turn.confirmedSubcategorySlug,
        summaryRequested: turn.summaryRequested,
        inputKind: turn.inputKind,
        mediaUploadIds: turn.mediaUploadIds,
      },
    });
    const invoked = functionResultSchema.parse(raw);
    if (invoked.error) throw new Error('AI_TURN_FAILED');
    aiConsentGate.assertAllowed();
    const result = aiDiagnosticSchema.parse(invoked.data);
    if (result.metadata.sessionId) {
      sessionIdRef.current = result.metadata.sessionId;
      setSessionId(result.metadata.sessionId);
    }
    return { diagnostic: result, turn };
  }

  async function confirmActiveTranscriptReview(turn: PendingCustomerTurn) {
    if (!aiConsentGranted) {
      setError(t('aiConsentRequired'));
      return;
    }
    if (!online) {
      setError(t('offline'));
      return;
    }
    let confirmed: PendingCustomerTurn;
    try {
      confirmed = confirmTranscriptReview(turn);
    } catch {
      setError(t('transcriptConfirmationFailed'));
      return;
    }
    const voiceUploadId = confirmed.mediaBindings.find((binding) => binding.kind === 'voice')
      ?.upload?.uploadId;
    if (!voiceUploadId) {
      setError(t('transcriptionFailed'));
      return;
    }
    setBusy(true);
    setError('');
    try {
      aiConsentGate.assertAllowed();
      const raw: unknown = await supabase.functions.invoke<unknown>('transcribe', {
        body: {
          action: 'confirm',
          uploadId: voiceUploadId,
          locale,
          clientMessageId: confirmed.clientMessageId,
          transcript: confirmed.transcript,
        },
      });
      aiConsentGate.assertAllowed();
      const response = functionResultSchema.parse(raw);
      if (response.error) throw new Error('TRANSCRIPT_CONFIRMATION_FAILED');
      const persisted = transcriptionConfirmationSchema.parse(response.data);
      confirmed = {
        ...confirmed,
        text: persisted.transcript,
        transcript: persisted.transcript,
      };
      setPendingTurns((current) =>
        current.map((item) =>
          item.clientMessageId === confirmed.clientMessageId ? confirmed : item,
        ),
      );
      setConversation((current) =>
        updateConversationTranscript(
          current,
          confirmed.clientMessageId,
          confirmed.transcript ?? '',
          'completed',
        ),
      );
      replaySignatureRef.current = '';
    } catch {
      setError(t('transcriptConfirmationFailed'));
    } finally {
      setBusy(false);
    }
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
    if (!aiConsentGranted || !restored || busy || !pendingTurns.length || replayingRef.current)
      return;
    if (pendingTurns[0]?.transcriptionStatus === 'review') return;
    const signature = pendingTurns
      .map((turn) => `${turn.clientMessageId}:${turn.transcriptionStatus}`)
      .join(':');
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
        if (replayed.pending.length && !isTranscriptReviewRequiredError(replayed.error)) {
          const retryableIds = new Set(replayed.pending.map((turn) => turn.clientMessageId));
          setConversation((current) =>
            current.map((message) =>
              message.role === 'user' &&
              message.clientMessageId &&
              retryableIds.has(message.clientMessageId)
                ? { ...message, delivery: 'retryable' as const }
                : message,
            ),
          );
          setError(
            replayed.error instanceof AiDataConsentRequiredError
              ? t('aiConsentRequired')
              : replayed.pending.some(
                    (turn) =>
                      turn.inputKind === 'voice' && turn.transcriptionStatus !== 'completed',
                  )
                ? t('transcriptionFailed')
                : t('aiUnavailableDraftCreated'),
          );
        } else setError('');
      })
      .finally(() => {
        replayingRef.current = false;
        setBusy(false);
      });
  }, [restored, online, busy, pendingTurns, aiConsentGranted]);

  function retryPendingTurn(clientMessageId?: string) {
    if (!online) {
      setError(t('offline'));
      return;
    }
    replaySignatureRef.current = '';
    setPendingTurns((current) =>
      retryFailedTranscriptionTurns(current).map((turn) =>
        !clientMessageId || turn.clientMessageId === clientMessageId
          ? {
              ...turn,
              transcriptionStatus:
                turn.inputKind === 'voice' && turn.transcriptionStatus !== 'completed'
                  ? 'pending'
                  : turn.transcriptionStatus,
            }
          : turn,
      ),
    );
    setConversation((current) =>
      current.map((message) =>
        message.role === 'user' &&
        (!clientMessageId || message.clientMessageId === clientMessageId) &&
        !message.authoritative
          ? {
              ...message,
              delivery: 'pending' as const,
              transcriptStatus:
                message.inputKind === 'voice' && message.transcriptStatus !== 'completed'
                  ? ('pending' as const)
                  : message.transcriptStatus,
            }
          : message,
      ),
    );
    setError('');
  }

  async function analyze(summaryRequested = false) {
    if (!aiConsentGranted) {
      setError(t('aiConsentRequired'));
      return;
    }
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
        confirmedSubcategorySlug: selectedSubcategorySlug || null,
        summaryRequested,
        createdAt: new Date().toISOString(),
      };
      const queued = enqueuePendingTurn(pendingTurns, turn);
      setPendingTurns(queued);
      setConversation((current) =>
        upsertPendingCustomerMessage(current, {
          clientMessageId: turn!.clientMessageId,
          text: userText || t('recordVoice'),
          offline: !online,
          mediaUploadIds,
          inputKind: turn!.inputKind,
        }),
      );
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
            selectedSubcategorySlug,
            categoryConfirmedByUser,
            categorySelectionSource,
            cityCode,
            urgency,
            schedule,
            coordinates,
            selectedAddressId,
            formattedAddress,
            addressLabel,
            building,
            unit,
            accessNotes,
            requestedStart,
            requestedEnd,
            journeyStep,
            diagnostic,
            imageUpload: null,
            voiceUpload: null,
            retainedMedia,
            activeImageMediaId: null,
            activeVoiceMediaId: null,
            requestMediaUploadIds: nextRequestMediaUploadIds,
            activeLocation,
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
    } catch (caught) {
      if (caught instanceof AiDataConsentRequiredError) {
        setError(t('aiConsentRequired'));
        return;
      }
      if (isTranscriptReviewRequiredError(caught)) {
        setDescription('');
        setError('');
        return;
      }
      if (!online && turn?.inputKind === 'voice') {
        setDescription('');
        setError(t('aiUnavailableDraftCreated'));
        return;
      }
      if (turn?.inputKind === 'voice' && turn.transcriptionStatus !== 'completed') {
        setConversation((current) =>
          markConversationMessageRetryable(current, turn!.clientMessageId),
        );
        setError(t('transcriptionFailed'));
        return;
      }
      const result = await fallback.diagnose({
        locale,
        messages: nextConversation,
        categoryHints: catalog.data?.categories.map((item) => item.slug) ?? [],
        confirmedCategorySlug:
          categoryConfirmedByUser && selectedCategorySlug ? selectedCategorySlug : null,
        confirmedSubcategorySlug: selectedSubcategorySlug || null,
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
        confirmedSubcategorySlug: selectedSubcategorySlug || null,
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
      const publicationMedia = await prepareQueuedTurn(
        {
          clientMessageId: `publication-media:${userId}`,
          text: 'publication media',
          inputKind: 'text',
          mediaUploadIds: requestMediaUploadIds,
          localMediaIds: activeBindings.map((binding) => binding.localMediaId),
          mediaBindings: activeBindings,
          transcript: null,
          transcriptionStatus: 'none',
          confirmedCategorySlug: selectedCategorySlug,
          confirmedSubcategorySlug: selectedSubcategorySlug || null,
          summaryRequested: false,
          createdAt: new Date().toISOString(),
        },
        false,
      );
      const media = [...new Set(publicationMedia.mediaUploadIds)].map((uploadId) => ({
        upload_id: uploadId,
      }));
      const window = publicationWindow(schedule, requestedStart, requestedEnd);
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
        selected_subcategory_slug: selectedSubcategorySlug || null,
        suggested_category_slug: suggestedCategorySlug || null,
        category_confirmed_by_user: categoryConfirmedByUser,
        category_selection_source: categorySelectionSource,
        city_code: cityCode,
        requested_start: window.requestedStart,
        requested_end: window.requestedEnd,
        schedule_preference: schedule,
        timing_mode: schedule,
        exact_location: coordinates,
        saved_address_id: selectedAddressId,
        location_details: {
          label: addressLabel.trim() || t('serviceLocation'),
          formatted_address: formattedAddress.trim(),
          building: building.trim() || null,
          unit: unit.trim() || null,
          access_notes: accessNotes.trim() || null,
        },
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
      if (activeLocation?.savedAddressId === null) customerLocation.clearTransientLocation();
      setPublishedRequestId(requestId);
      withdrawAiData();
      setJourneyStep('success');
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
      customerLocation.clearTransientLocation();
      setRequestedStart(null);
      setRequestedEnd(null);
      setPublishedRequestId(null);
      setJourneyStep('category');
      setSuggestedCategorySlug('');
      setSelectedCategorySlug('');
      setSelectedSubcategorySlug('');
      setCategoryConfirmedByUser(false);
      setCategorySelectionSource(null);
      setUrgency('normal');
      setSchedule('flexible');
      setApproved(false);
      setRetainedMedia([]);
      withdrawAiData();
      setManualIntake(false);
    } catch {
      setError(t('deleteDraftFailed'));
    } finally {
      setBusy(false);
    }
  }
  function moveToStep(next: RequestJourneyStep) {
    setError('');
    setJourneyStep(next);
  }
  function startAnotherDraft() {
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
    customerLocation.clearTransientLocation();
    setRequestedStart(null);
    setRequestedEnd(null);
    setPublishedRequestId(null);
    setSuggestedCategorySlug('');
    setSelectedCategorySlug('');
    setSelectedSubcategorySlug('');
    setCategoryConfirmedByUser(false);
    setCategorySelectionSource(null);
    setUrgency('normal');
    setSchedule('flexible');
    setApproved(false);
    setJourneyStep('category');
  }
  const selectedSubcategory = availableSubcategories.find(
    (item) => item.slug === selectedSubcategorySlug,
  );
  const timingSummary =
    schedule === 'asap'
      ? t('timingAsap')
      : schedule === 'flexible'
        ? t('timingFlexible')
        : requestedStart && requestedEnd
          ? t('scheduleWindow', {
              start: new Date(requestedStart).toLocaleString(locale === 'ar' ? 'ar-SA' : locale, {
                timeZone: 'Asia/Riyadh',
                dateStyle: 'medium',
                timeStyle: 'short',
              }),
              end: new Date(requestedEnd).toLocaleTimeString(locale === 'ar' ? 'ar-SA' : locale, {
                timeZone: 'Asia/Riyadh',
                hour: 'numeric',
                minute: '2-digit',
              }),
            })
          : t('timingRequired');
  const structuredAnswers = conversation.filter((message) => message.role === 'user');
  const reviewImages = retainedMedia.filter((media) => media.kind === 'image');
  const attachedImageCount = reviewImages.length;
  const voiceTurns = pendingTurns.filter((turn) => turn.inputKind === 'voice');
  const latestVoiceTurn = voiceTurns.at(-1);
  const transcriptReviewTurn = voiceTurns.find((turn) => turn.transcriptionStatus === 'review');
  const completedVoiceMessage = conversation
    .filter((message) => message.role === 'user' && message.inputKind === 'voice')
    .at(-1);
  const voiceReview =
    completedVoiceMessage?.transcriptStatus === 'completed'
      ? `${t('transcriptReady')}: ${completedVoiceMessage.text}`
      : latestVoiceTurn?.transcript
        ? `${t('transcriptReady')}: ${latestVoiceTurn.transcript}`
        : latestVoiceTurn?.transcriptionStatus === 'retryable'
          ? t('transcriptRetryRequired')
          : activeVoiceMediaId || latestVoiceTurn
            ? t('transcriptPending')
            : t('voiceNotAttached');
  const urgencySummary =
    urgency === 'flexible'
      ? t('priorityFlexible')
      : urgency === 'urgent' || urgency === 'safety_critical'
        ? t('priorityUrgent')
        : t('priorityNormal');
  const aiReview = !diagnostic
    ? t('aiNotUsedReview')
    : diagnostic.metadata.fallback
      ? t('aiFallbackReview')
      : diagnostic.enoughInformation
        ? t('aiReadyReview', { confidence: Math.round(diagnostic.confidence * 100) })
        : t('aiUncertainReview', { confidence: Math.round(diagnostic.confidence * 100) });

  if (journeyStep === 'success') {
    return (
      <CustomerScreen testID="request-publish-success">
        <View style={journeyStyles.success}>
          <View style={journeyStyles.successIcon}>
            <AppIcon color={tokens.colors.success} name="check" size={36} strokeWidth={3} />
          </View>
          <Text
            accessibilityLiveRegion="polite"
            accessibilityRole="header"
            style={[customerStyles.display, textDirection]}
          >
            {t('publishSuccessTitle')}
          </Text>
          <Text style={[customerStyles.bodyMuted, textDirection]}>{t('publishSuccessBody')}</Text>
          {publishedRequestId ? (
            <Text selectable style={[customerStyles.caption, textDirection]}>
              {t('requestNumber', { id: publishedRequestId })}
            </Text>
          ) : null}
        </View>
        <ActionButton
          label={t('viewMyRequests')}
          onPress={() => router.replace('/customer-requests')}
        />
        <ActionButton
          label={t('startAnotherRequest')}
          onPress={startAnotherDraft}
          variant="secondary"
        />
      </CustomerScreen>
    );
  }

  return (
    <CustomerScreen scroll={journeyStep !== 'chat'} testID={`request-step-${journeyStep}`}>
      {journeyStep !== 'category' ? (
        <ActionButton
          icon={logicalChevron(locale, 'back')}
          label={t('back')}
          onPress={() =>
            moveToStep(
              journeyStep === 'chat'
                ? 'category'
                : journeyStep === 'location'
                  ? 'chat'
                  : journeyStep === 'timing'
                    ? 'location'
                    : 'timing',
            )
          }
          variant="ghost"
        />
      ) : null}
      <StepHeader
        body={
          journeyStep === 'category'
            ? t('categoryStepBody')
            : journeyStep === 'chat'
              ? t('chatStepBody')
              : journeyStep === 'location'
                ? t('locationStepBody')
                : journeyStep === 'timing'
                  ? t('timingStepBody')
                  : t('reviewStepBody')
        }
        current={requestJourneyStepNumber(journeyStep)}
        eyebrow={t('stepProgress', {
          current: requestJourneyStepNumber(journeyStep),
          total: 5,
        })}
        title={
          journeyStep === 'category'
            ? t('categoryStepTitle')
            : journeyStep === 'chat'
              ? t('chatStepTitle')
              : journeyStep === 'location'
                ? t('locationStepTitle')
                : journeyStep === 'timing'
                  ? t('timingStepTitle')
                  : t('reviewStepTitle')
        }
        total={5}
      />

      {journeyStep === 'category' ? (
        <>
          {catalog.isPending ? <LoadingBlock label={t('loading')} rows={5} /> : null}
          {catalog.isError ? (
            <Notice live tone="danger">
              {t('catalogLoadFailed')}
            </Notice>
          ) : null}
          <View style={[journeyStyles.categoryGrid, logicalRowStyle(locale)]}>
            {catalog.data?.categories.map((category) => {
              const selected = selectedCategorySlug === category.slug;
              const translation = category.service_category_translations[0];
              return (
                <Pressable
                  key={category.id}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  onPress={() => {
                    setSelectedCategorySlug(category.slug);
                    setSelectedSubcategorySlug('');
                    setCategoryConfirmedByUser(true);
                    setCategorySelectionSource(
                      resolveCategorySelectionSource(category.slug, suggestedCategorySlug || null),
                    );
                    invalidateApproval();
                  }}
                  style={({ pressed }) => [
                    journeyStyles.categoryCard,
                    { direction: logicalWritingDirection(locale) },
                    selected && journeyStyles.categoryCardSelected,
                    pressed && journeyStyles.pressed,
                  ]}
                >
                  <View style={journeyStyles.categoryIcon}>
                    <AppIcon
                      color={selected ? tokens.colors.white : tokens.colors.primaryStrong}
                      name={categoryIconName(category.icon_key, category.slug)}
                      size={27}
                    />
                  </View>
                  <Text
                    style={[
                      journeyStyles.categoryName,
                      textDirection,
                      selected && journeyStyles.categoryNameSelected,
                    ]}
                  >
                    {translation?.name ?? category.slug}
                  </Text>
                  <Text
                    numberOfLines={2}
                    style={[
                      customerStyles.caption,
                      textDirection,
                      selected && journeyStyles.categoryDescriptionSelected,
                    ]}
                  >
                    {translation?.description ?? ''}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          {selectedCategorySlug ? (
            <Surface tone="muted">
              <Text style={[customerStyles.section, textDirection]}>
                {t('optionalSubcategory')}
              </Text>
              <View style={[customerStyles.wrap, logicalRowStyle(locale)]}>
                <Pill
                  label={t('noSubcategory')}
                  onPress={() => setSelectedSubcategorySlug('')}
                  selected={!selectedSubcategorySlug}
                />
                {availableSubcategories.map((subcategory) => (
                  <Pill
                    key={subcategory.id}
                    label={
                      subcategory.service_subcategory_translations[0]?.name ?? subcategory.slug
                    }
                    onPress={() => setSelectedSubcategorySlug(subcategory.slug)}
                    selected={selectedSubcategorySlug === subcategory.slug}
                  />
                ))}
              </View>
            </Surface>
          ) : null}
          {error ? (
            <Notice live tone="danger">
              {error}
            </Notice>
          ) : null}
          <ActionButton
            disabled={!selectedCategorySlug || catalog.isError}
            label={t('continueToDiagnosis')}
            onPress={() => {
              if (!selectedCategorySlug) {
                setError(t('categoryRequired'));
                return;
              }
              moveToStep('chat');
            }}
          />
        </>
      ) : null}

      {journeyStep === 'chat' ? (
        <View style={journeyStyles.chatLayout}>
          <ScrollView
            contentContainerStyle={journeyStyles.chatTimeline}
            keyboardShouldPersistTaps="handled"
            onContentSizeChange={() => {
              if (aiConsentGranted) chatScrollRef.current?.scrollToEnd({ animated: true });
            }}
            ref={chatScrollRef}
            showsVerticalScrollIndicator={false}
            style={journeyStyles.chatScroll}
          >
            <AiDataConsentPanel
              granted={aiConsentGranted}
              manual={manualIntake}
              pending={busy}
              hasQueuedWork={pendingTurns.length > 0}
              onGrant={allowAiData}
              onWithdraw={withdrawAiData}
              onManual={continueManually}
              onReport={() => router.push('/support')}
            />
            <Notice>{t('aiDisclaimer')}</Notice>
            <ConversationTimeline
              assistantLabel={t('aiAssistantName')}
              messages={conversation}
              offlineLabel={t('messageOffline')}
              onRetry={retryPendingTurn}
              pendingLabel={t('messagePending')}
              retryLabel={t('messageRetry')}
              userLabel={t('you')}
            />
            {diagnostic?.quickReplies.length ? (
              <View style={[customerStyles.wrap, logicalRowStyle(locale)]}>
                {diagnostic.quickReplies.map((reply) => (
                  <QuickReplyChip
                    key={reply}
                    label={reply}
                    onPress={() => {
                      setDescription(reply);
                      invalidateApproval();
                    }}
                    selected={description === reply}
                  />
                ))}
              </View>
            ) : null}
            {diagnostic?.safetyFlags.length ? (
              <Notice tone="danger">{t('safetyGuidance')}</Notice>
            ) : null}
            {diagnostic ? (
              <Surface tone="muted">
                <View style={[customerStyles.row, logicalRowStyle(locale)]}>
                  <AppIcon color={tokens.colors.primaryStrong} name="sparkles" size={20} />
                  <Text style={[customerStyles.section, textDirection]}>
                    {t('aiAssistantName')}
                  </Text>
                </View>
                <Text style={[customerStyles.caption, textDirection]}>
                  {t('confidenceSummary', {
                    confidence: Math.round(diagnostic.confidence * 100),
                  })}
                </Text>
                {!diagnostic.enoughInformation ? (
                  <ActionButton
                    disabled={!aiConsentGranted || busy}
                    label={t('createSummaryNow')}
                    onPress={() => void analyze(true)}
                    variant="secondary"
                  />
                ) : null}
              </Surface>
            ) : null}
            {error ? (
              <Notice live tone="warning">
                {error}
              </Notice>
            ) : null}
            {title.trim().length < 3 || summary.trim().length < 10 ? (
              <Text style={[customerStyles.caption, textDirection]}>
                {t('informationIncomplete')}
              </Text>
            ) : null}
          </ScrollView>

          <View style={journeyStyles.composerDock}>
            {manualIntake ? (
              <Surface>
                <Field
                  label={t('requestTitlePlaceholder')}
                  maxLength={120}
                  onChangeText={(value) => {
                    setTitle(value);
                    invalidateApproval();
                  }}
                  value={title}
                />
                <Field
                  label={t('aiManualDescription')}
                  maxLength={8000}
                  multiline
                  onChangeText={(value) => {
                    setSummary(value);
                    setDescription(value);
                    invalidateApproval();
                  }}
                  value={summary}
                />
              </Surface>
            ) : null}
            {activeImageMediaId ? (
              <MediaPreview
                imageSource={{
                  uri:
                    image?.uri ??
                    retainedMedia.find((item) => item.id === activeImageMediaId)?.localUri ??
                    '',
                }}
                kind="image"
                label={t('attachedImageA11y')}
              />
            ) : null}
            {activeVoiceMediaId ? (
              <MediaPreview kind="voice" label={t('turnAttachmentReady')} />
            ) : null}
            {transcriptReviewTurn ? (
              <Surface testID="transcript-review" tone="accent">
                <Text style={[customerStyles.section, textDirection]}>
                  {t('transcriptReviewTitle')}
                </Text>
                <Text style={[customerStyles.caption, textDirection]}>
                  {t('transcriptReviewBody')}
                </Text>
                <Field
                  label={t('transcriptReviewField')}
                  maxLength={8_000}
                  multiline
                  onChangeText={(value) => {
                    try {
                      const edited = updateTranscriptReview(transcriptReviewTurn, value);
                      setPendingTurns((current) =>
                        current.map((turn) =>
                          turn.clientMessageId === edited.clientMessageId ? edited : turn,
                        ),
                      );
                      setConversation((current) =>
                        updateConversationTranscript(
                          current,
                          edited.clientMessageId,
                          edited.transcript ?? '',
                          'review',
                        ),
                      );
                      setError('');
                    } catch {
                      setError(t('transcriptConfirmationFailed'));
                    }
                  }}
                  value={transcriptReviewTurn.transcript ?? ''}
                />
                <ActionButton
                  disabled={!aiConsentGranted || busy || !transcriptReviewTurn.transcript?.trim()}
                  label={t('confirmTranscript')}
                  loading={busy}
                  onPress={() => void confirmActiveTranscriptReview(transcriptReviewTurn)}
                />
              </Surface>
            ) : !manualIntake ? (
              <ChatComposer
                cameraLabel={t('cameraPhoto')}
                disabled={busy || !aiConsentGranted || manualIntake}
                galleryLabel={activeImageMediaId ? t('changePhoto') : t('galleryPhoto')}
                onCamera={() => void pickImage('camera')}
                onChangeText={(value) => {
                  setDescription(value);
                  invalidateApproval();
                }}
                onGallery={() => void pickImage('library')}
                onSend={() => void analyze(false)}
                onVoice={() =>
                  void (recorderState.isRecording ? stopRecording() : startRecording())
                }
                placeholder={
                  conversation.length
                    ? t('answerFollowUpPlaceholder')
                    : t('problemDescriptionPlaceholder')
                }
                sendLabel={busy ? t('analyzing') : t('send')}
                value={description}
                voiceLabel={
                  recorderState.isRecording
                    ? t('stopRecordingSeconds', {
                        seconds: Math.ceil(recorderState.durationMillis / 1000),
                      })
                    : t('recordVoice')
                }
              />
            ) : null}
            <ActionButton
              disabled={
                pendingTurns.length > 0 || title.trim().length < 3 || summary.trim().length < 10
              }
              label={t('continueToLocation')}
              onPress={() => moveToStep('location')}
            />
            <ActionButton
              disabled={busy || !userId}
              label={t('deleteDraft')}
              onPress={() =>
                Alert.alert(t('deleteDraftTitle'), t('deleteDraftMessage'), [
                  { text: t('cancel'), style: 'cancel' },
                  {
                    text: t('deleteDraft'),
                    style: 'destructive',
                    onPress: () => void deleteDraft(),
                  },
                ])
              }
              variant="ghost"
            />
          </View>
        </View>
      ) : null}

      {journeyStep === 'location' ? (
        <>
          <Notice>{t('customerPrivacyNotice')}</Notice>
          {customerLocation.loading ? <LoadingBlock label={t('loading')} rows={2} /> : null}
          {customerLocation.error ? (
            <Notice tone="warning">{t('savedAddressLoadFailed')}</Notice>
          ) : null}
          {activeLocation ? (
            <Surface tone="accent">
              <View style={[journeyStyles.locationLead, logicalRowStyle(locale)]}>
                <AppIcon color={tokens.colors.primaryStrong} name="location" size={24} />
                <View style={journeyStyles.flex}>
                  <Text style={[customerStyles.section, textDirection]}>
                    {activeLocation.label}
                  </Text>
                  <Text numberOfLines={3} style={[customerStyles.body, textDirection]}>
                    {activeLocation.formattedAddress}
                  </Text>
                  <Text style={[customerStyles.caption, textDirection]}>
                    {locale === 'ar' || locale === 'ur'
                      ? activeLocation.cityNameAr
                      : activeLocation.cityNameEn}
                  </Text>
                  {building || unit || accessNotes ? (
                    <Text style={[customerStyles.caption, textDirection]}>
                      {[building, unit, accessNotes].filter(Boolean).join(' · ')}
                    </Text>
                  ) : null}
                </View>
              </View>
            </Surface>
          ) : (
            <Notice tone="warning">{t('locationRequired')}</Notice>
          )}
          <ActionButton
            icon="location"
            label={activeLocation ? t('changeLocation') : t('chooseLocation')}
            onPress={() => router.push('/locations')}
            variant="secondary"
          />
          {shouldOfferTransientSave(activeLocation) ? (
            <ActionButton
              disabled={busy || !customerLocation.loaded}
              label={t('saveThisLocation')}
              loading={busy}
              onPress={() => void saveActiveTransientLocation()}
              variant="secondary"
            />
          ) : null}
          {error ? (
            <Notice live tone={error === t('locationSaved') ? 'success' : 'warning'}>
              {error}
            </Notice>
          ) : null}
          <ActionButton
            disabled={!coordinates || formattedAddress.trim().length < 3 || !cityCode}
            label={t('confirmLocation')}
            onPress={() => {
              if (!coordinates || formattedAddress.trim().length < 3) {
                setError(t('locationRequired'));
                return;
              }
              moveToStep('timing');
            }}
          />
        </>
      ) : null}

      {journeyStep === 'timing' ? (
        <>
          <View style={journeyStyles.choiceStack}>
            {(['asap', 'scheduled', 'flexible'] as const).map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                accessibilityState={{ selected: schedule === value }}
                onPress={() => {
                  setSchedule(value);
                  if (value === 'scheduled') {
                    const window = buildRiyadhScheduleWindow('morning');
                    setRequestedStart(window.requestedStart);
                    setRequestedEnd(window.requestedEnd);
                  } else {
                    setRequestedStart(null);
                    setRequestedEnd(null);
                  }
                  invalidateApproval();
                }}
                style={[
                  journeyStyles.choiceCard,
                  logicalRowStyle(locale),
                  schedule === value && journeyStyles.choiceCardSelected,
                ]}
              >
                <AppIcon
                  color={schedule === value ? tokens.colors.primaryStrong : tokens.colors.textMuted}
                  name={value === 'scheduled' ? 'calendar' : 'time'}
                  size={24}
                />
                <View style={journeyStyles.flex}>
                  <Text style={[customerStyles.section, textDirection]}>
                    {value === 'asap'
                      ? t('timingAsap')
                      : value === 'scheduled'
                        ? t('schedule')
                        : t('timingFlexible')}
                  </Text>
                  <Text style={[customerStyles.caption, textDirection]}>
                    {value === 'flexible' ? t('providerPrivacyNotice') : t('timingStepBody')}
                  </Text>
                </View>
                {schedule === value ? (
                  <AppIcon color={tokens.colors.primaryStrong} name="check" size={22} />
                ) : null}
              </Pressable>
            ))}
          </View>
          {schedule === 'scheduled' ? (
            <Surface tone="muted">
              <Text style={[customerStyles.section, textDirection]}>{t('schedule')}</Text>
              <View style={[customerStyles.wrap, logicalRowStyle(locale)]}>
                {(['morning', 'afternoon', 'evening'] as const).map((preset) => {
                  const window = buildRiyadhScheduleWindow(preset);
                  return (
                    <Pill
                      key={preset}
                      label={
                        preset === 'morning'
                          ? t('scheduleMorning')
                          : preset === 'afternoon'
                            ? t('scheduleAfternoon')
                            : t('scheduleEvening')
                      }
                      onPress={() => {
                        setRequestedStart(window.requestedStart);
                        setRequestedEnd(window.requestedEnd);
                        invalidateApproval();
                      }}
                      selected={requestedStart === window.requestedStart}
                    />
                  );
                })}
              </View>
              <Text style={[customerStyles.body, textDirection]}>{timingSummary}</Text>
            </Surface>
          ) : null}
          <Surface>
            <Text style={[customerStyles.section, textDirection]}>{t('priority')}</Text>
            <View style={[customerStyles.wrap, logicalRowStyle(locale)]}>
              {(['flexible', 'normal', 'urgent'] as const).map((value) => (
                <Pill
                  key={value}
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
                  selected={urgency === value}
                />
              ))}
            </View>
          </Surface>
          {!readyForReview ? <Notice tone="warning">{t('timingRequired')}</Notice> : null}
          <ActionButton
            disabled={!readyForReview}
            label={t('continueToReview')}
            onPress={() => moveToStep('review')}
          />
        </>
      ) : null}

      {journeyStep === 'review' ? (
        <>
          <Surface>
            <View style={[customerStyles.between, logicalRowStyle(locale)]}>
              <Text style={[customerStyles.section, textDirection]}>{t('requestDetails')}</Text>
              <ActionButton
                label={t('editSection')}
                onPress={() => moveToStep('chat')}
                variant="ghost"
              />
            </View>
            <Field
              label={t('requestTitlePlaceholder')}
              maxLength={120}
              onChangeText={(value) => {
                setTitle(value);
                invalidateApproval();
              }}
              value={title}
            />
            <Field
              label={t('aiSummary')}
              maxLength={8000}
              multiline
              onChangeText={(value) => {
                setSummary(value);
                invalidateApproval();
              }}
              value={summary}
            />
          </Surface>
          <Surface>
            <View style={[customerStyles.between, logicalRowStyle(locale)]}>
              <Text style={[customerStyles.section, textDirection]}>{t('structuredAnswers')}</Text>
              <ActionButton
                label={t('editSection')}
                onPress={() => moveToStep('chat')}
                variant="ghost"
              />
            </View>
            {structuredAnswers.length ? (
              structuredAnswers.map((answer, index) => (
                <Text
                  key={answer.clientMessageId ?? index}
                  style={[customerStyles.body, textDirection]}
                >
                  {index + 1}. {answer.text}
                </Text>
              ))
            ) : (
              <Text style={[customerStyles.caption, textDirection]}>
                {t('noStructuredAnswers')}
              </Text>
            )}
          </Surface>
          <Surface>
            <View style={[customerStyles.between, logicalRowStyle(locale)]}>
              <Text style={[customerStyles.section, textDirection]}>{t('serviceCategories')}</Text>
              <ActionButton
                label={t('editSection')}
                onPress={() => moveToStep('category')}
                variant="ghost"
              />
            </View>
            <Text style={[customerStyles.body, textDirection]}>
              {selectedCategory?.service_category_translations[0]?.name ?? selectedCategorySlug}
              {selectedSubcategory
                ? ` · ${selectedSubcategory.service_subcategory_translations[0]?.name ?? selectedSubcategory.slug}`
                : ''}
            </Text>
            {suggestedCategorySlug ? (
              <Text style={[customerStyles.caption, textDirection]}>
                {t('editableAiCategory')}:{' '}
                {suggestedCategory?.service_category_translations[0]?.name ?? t('categoryUnknown')}
              </Text>
            ) : null}
          </Surface>
          <Surface>
            <View style={[customerStyles.between, logicalRowStyle(locale)]}>
              <Text style={[customerStyles.section, textDirection]}>{t('requestAttachments')}</Text>
              <ActionButton
                label={t('editSection')}
                onPress={() => moveToStep('chat')}
                variant="ghost"
              />
            </View>
            <Text style={[customerStyles.body, textDirection]}>
              {t('attachedImagesCount', { count: attachedImageCount })}
            </Text>
            {reviewImages.map((media) => (
              <MediaPreview
                imageSource={{ uri: media.localUri }}
                key={media.id}
                kind="image"
                label={t('attachedImageA11y')}
              />
            ))}
            <Text style={[customerStyles.body, textDirection]}>{voiceReview}</Text>
          </Surface>
          <Surface>
            <View style={[customerStyles.between, logicalRowStyle(locale)]}>
              <Text style={[customerStyles.section, textDirection]}>{t('serviceLocation')}</Text>
              <ActionButton
                label={t('editSection')}
                onPress={() => moveToStep('location')}
                variant="ghost"
              />
            </View>
            <Text style={[customerStyles.section, textDirection]}>{addressLabel}</Text>
            <Text style={[customerStyles.body, textDirection]}>{formattedAddress}</Text>
            {building ? (
              <Text style={[customerStyles.caption, textDirection]}>
                {t('building')}: {building}
              </Text>
            ) : null}
            {unit ? (
              <Text style={[customerStyles.caption, textDirection]}>
                {t('unit')}: {unit}
              </Text>
            ) : null}
            {accessNotes ? (
              <Text style={[customerStyles.caption, textDirection]}>
                {t('accessNotes')}: {accessNotes}
              </Text>
            ) : null}
            <Notice>{t('customerPrivacyNotice')}</Notice>
          </Surface>
          <Surface>
            <View style={[customerStyles.between, logicalRowStyle(locale)]}>
              <Text style={[customerStyles.section, textDirection]}>{t('requestedTiming')}</Text>
              <ActionButton
                label={t('editSection')}
                onPress={() => moveToStep('timing')}
                variant="ghost"
              />
            </View>
            <Text style={[customerStyles.body, textDirection]}>{timingSummary}</Text>
            <Text style={[customerStyles.body, textDirection]}>
              {t('urgencyReview')}: {urgencySummary}
            </Text>
          </Surface>
          <Surface>
            <View style={[customerStyles.between, logicalRowStyle(locale)]}>
              <Text style={[customerStyles.section, textDirection]}>{t('safetyReview')}</Text>
              <ActionButton
                label={t('editSection')}
                onPress={() => moveToStep('chat')}
                variant="ghost"
              />
            </View>
            <Text style={[customerStyles.body, textDirection]}>
              {diagnostic?.safetyFlags.length ? t('safetyGuidance') : t('noSafetyFlags')}
            </Text>
          </Surface>
          <Surface>
            <View style={[customerStyles.between, logicalRowStyle(locale)]}>
              <Text style={[customerStyles.section, textDirection]}>{t('aiReviewState')}</Text>
              <ActionButton
                label={t('editSection')}
                onPress={() => moveToStep('chat')}
                variant="ghost"
              />
            </View>
            <Text style={[customerStyles.body, textDirection]}>{aiReview}</Text>
          </Surface>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: approved }}
            onPress={() => setApproved((value) => !value)}
            style={[
              journeyStyles.approval,
              logicalRowStyle(locale),
              approved && journeyStyles.approvalSelected,
            ]}
          >
            <View style={journeyStyles.checkbox}>
              {approved ? <AppIcon color={tokens.colors.white} name="check" size={18} /> : null}
            </View>
            <Text style={[journeyStyles.approvalText, textDirection]}>
              {t('customerApprovalLabel')}
            </Text>
          </Pressable>
          {!approved ? <Notice tone="warning">{t('approvalRequired')}</Notice> : null}
          {error ? (
            <Notice live tone="danger">
              {error}
            </Notice>
          ) : null}
          <ActionButton
            disabled={!canPublish || busy}
            label={busy ? t('publishingRequest') : t('publishRequest')}
            loading={busy}
            onPress={() => void publish()}
          />
        </>
      ) : null}
    </CustomerScreen>
  );
}

const journeyStyles = StyleSheet.create({
  chatLayout: { flex: 1, minHeight: 0, gap: tokens.spacing.sm },
  chatScroll: { flex: 1 },
  chatTimeline: { gap: tokens.spacing.sm, paddingBottom: tokens.spacing.sm },
  composerDock: {
    gap: tokens.spacing.sm,
    paddingTop: tokens.spacing.xs,
    backgroundColor: tokens.colors.canvas,
  },
  categoryGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
  categoryCard: {
    width: '48%',
    minHeight: 154,
    borderRadius: tokens.radius.lg,
    padding: tokens.spacing.md,
    gap: tokens.spacing.xs,
    backgroundColor: tokens.colors.surface,
    borderColor: tokens.colors.border,
    borderWidth: 1,
  },
  categoryCardSelected: {
    backgroundColor: tokens.colors.primary,
    borderColor: tokens.colors.primary,
  },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: tokens.radius.md,
    backgroundColor: tokens.colors.primarySoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryName: { ...tokens.type.label, color: tokens.colors.ink, textAlign: 'auto' },
  categoryNameSelected: { color: tokens.colors.white },
  categoryDescriptionSelected: { color: tokens.colors.primarySoft },
  pressed: { opacity: 0.72, transform: [{ scale: 0.99 }] },
  composer: { gap: tokens.spacing.md },
  mediaActions: { flexDirection: 'row', flexWrap: 'wrap', gap: tokens.spacing.sm },
  previewImage: { width: '100%', height: 190, borderRadius: tokens.radius.md },
  mapShell: {
    height: 330,
    overflow: 'hidden',
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surfaceMuted,
  },
  locationSection: { gap: tokens.spacing.sm },
  locationLead: { flexDirection: 'row', alignItems: 'flex-start', gap: tokens.spacing.sm },
  savedAddress: {
    minHeight: 70,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.sm,
    borderRadius: tokens.radius.md,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
    padding: tokens.spacing.md,
  },
  savedAddressSelected: {
    borderColor: tokens.colors.primary,
    backgroundColor: tokens.colors.primarySoft,
  },
  flex: { flex: 1, gap: tokens.spacing.xxs },
  twoColumns: { flexDirection: 'row', gap: tokens.spacing.sm },
  switchRow: {
    minHeight: tokens.touchTarget,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  choiceStack: { gap: tokens.spacing.sm },
  choiceCard: {
    minHeight: 88,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.colors.border,
    backgroundColor: tokens.colors.surface,
    padding: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  choiceCardSelected: {
    borderColor: tokens.colors.primary,
    backgroundColor: tokens.colors.primarySoft,
  },
  approval: {
    minHeight: 72,
    borderRadius: tokens.radius.lg,
    borderWidth: 1,
    borderColor: tokens.colors.borderStrong,
    backgroundColor: tokens.colors.surface,
    padding: tokens.spacing.md,
    flexDirection: 'row',
    alignItems: 'center',
    gap: tokens.spacing.md,
  },
  approvalSelected: {
    borderColor: tokens.colors.primary,
    backgroundColor: tokens.colors.primarySoft,
  },
  checkbox: {
    width: 26,
    height: 26,
    borderRadius: 8,
    borderWidth: 2,
    borderColor: tokens.colors.primary,
    backgroundColor: tokens.colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  approvalText: { flex: 1, ...tokens.type.body, color: tokens.colors.ink, textAlign: 'auto' },
  success: {
    minHeight: 360,
    alignItems: 'center',
    justifyContent: 'center',
    gap: tokens.spacing.md,
  },
  successIcon: {
    width: 76,
    height: 76,
    borderRadius: 38,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: tokens.colors.successSoft,
  },
});
