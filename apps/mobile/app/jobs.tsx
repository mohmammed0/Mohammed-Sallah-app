import { createRandomId } from '../src/lib/random-id';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Link, useLocalSearchParams } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Image, Linking, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { z } from 'zod';
import { MarketplaceApi } from '@sallah/api';
import { formatSar, formatStatusLabel, type TranslationKey } from '@sallah/i18n';
import { Button, Card, LoadingSkeleton, Screen, styles } from '@/components/ui';
import { ProgressTimeline, resolveTimelineIndex } from '@/design-system/customer-components';
import { supabase } from '@/lib/supabase';
import { secureUpload } from '@/lib/secure-upload';
import { useLocale } from '@/providers/locale-provider';
import { reduceLocationSharing, type LocationSharingState } from '@/features/jobs/location-sharing';
import { JobTrackingMap } from '@/features/jobs/job-tracking-map';
import {
  canAcceptCompletionEvidence,
  completionEvidenceManifestSchema,
  isCurrentCompletionEvidence,
  type CompletionEvidenceBatch,
} from '@/features/jobs/completion-evidence';
import { CustomerJobStatus } from '@/features/jobs/customer-job-status';
import { jobSchema, type Job } from '../src/features/jobs/job-read-contract';
import { useActiveScreen } from '@/features/connectivity/use-active-screen';
import { executeJournaledMutation, type MutationOperation } from '@/lib/mutation-journal';
import type { MarketplaceReportIntent } from '@sallah/domain/trust';
import { TrustControls } from '../src/features/trust/trust-controls';
import { createTrustRpcClient, submitMarketplaceReport } from '../src/features/trust/trust-client';

const trustClient = createTrustRpcClient(supabase);

const providerNext: Record<string, string | undefined> = {
  scheduled: 'en_route',
  en_route: 'arrived',
  arrived: 'diagnosing',
  diagnosing: 'in_progress',
};
const actionLabelKeys: Record<string, TranslationKey> = {
  scheduled: 'jobActionSchedule',
  en_route: 'jobActionEnRoute',
  arrived: 'jobActionArrived',
  diagnosing: 'jobActionDiagnose',
  in_progress: 'jobActionStart',
};
const cancellationStatusKeys: Record<string, TranslationKey> = {
  pending: 'cancellationPending',
  approved: 'cancellationApproved',
  rejected: 'cancellationRejected',
  financial_pending: 'cancellationFinancialPending',
};
const disputeStatusKeys: Record<string, TranslationKey> = {
  open: 'disputeOpen',
  waiting_customer: 'disputeWaitingCustomer',
  waiting_provider: 'disputeWaitingProvider',
  waiting_operations: 'disputeWaitingOperations',
  resolved: 'disputeResolved',
  closed: 'disputeClosed',
};
const jobTimelineStatuses = [
  'provider_selected',
  'scheduled',
  'en_route',
  'arrived',
  'diagnosing',
  'awaiting_change_order_approval',
  'in_progress',
  'completion_submitted',
  'completed',
] as const;

export default function Jobs() {
  const activeScreen = useActiveScreen();
  const { locale, t } = useLocale();
  const params = useLocalSearchParams<{ jobId?: string; requestId?: string }>();
  const scope = z
    .object({ jobId: z.uuid().optional(), requestId: z.uuid().optional() })
    .safeParse(params);
  const [reason, setReason] = useState('');
  const [rating, setRating] = useState('5');
  const [review, setReview] = useState('');
  const [changeDescription, setChangeDescription] = useState('');
  const [changeAmount, setChangeAmount] = useState('');
  const [locationStates, setLocationStates] = useState<Record<string, LocationSharingState>>({});
  const [locations, setLocations] = useState<
    Record<
      string,
      {
        formattedAddress: string;
        latitude: number;
        longitude: number;
        providerLocation?: { latitude: number; longitude: number; capturedAt: string } | null;
      }
    >
  >({});
  const [evidenceBatches, setEvidenceBatches] = useState<Record<string, CompletionEvidenceBatch>>(
    {},
  );
  const evidenceBatchesRef = useRef(evidenceBatches);
  const evidenceLoads = useRef<Record<string, number>>({});
  const currentJobs = useRef<readonly Job[]>([]);
  const mounted = useRef(false);
  const activeLocationShares = useRef<
    Record<
      string,
      {
        sessionId: string;
        subscription: Location.LocationSubscription;
        timer: ReturnType<typeof setTimeout>;
      }
    >
  >({});
  const query = useQuery({
    queryKey: ['jobs', params.jobId ?? null, params.requestId ?? null],
    enabled: scope.success && activeScreen,
    refetchInterval: activeScreen ? 8_000 : false,
    refetchIntervalInBackground: false,
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('AUTH_REQUIRED');
      if (!scope.success) throw new Error('INVALID_JOB_ROUTE');
      let jobQuery = supabase
        .from('jobs')
        .select(
          'id,customer_id,provider_id,status,approved_total_minor,version,created_at,payments(amount_minor,refunded_minor,status),conversations(id),job_location_updates(captured_at,expires_at),change_orders(id,reason,description,revised_total_minor,status,expires_at),cancellation_requests(id,status,reason,created_at),disputes(id,status,reason,created_at,resolved_at),ratings(id,customer_id,provider_id,score,review,moderation_status)',
        );
      if (scope.data.jobId) jobQuery = jobQuery.eq('id', scope.data.jobId);
      if (scope.data.requestId) jobQuery = jobQuery.eq('request_id', scope.data.requestId);
      const { data, error } = await jobQuery.order('created_at', { ascending: false }).limit(50);
      if (error) throw error;
      return { userId: userData.user.id, jobs: z.array(jobSchema).parse(data ?? []) };
    },
  });
  useLayoutEffect(() => {
    currentJobs.current = query.data?.jobs ?? [];
  }, [query.data?.jobs]);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      currentJobs.current = [];
      evidenceLoads.current = {};
      evidenceBatchesRef.current = {};
    };
  }, []);
  const command = useMutation({
    mutationFn: async (run: () => Promise<unknown>) => run(),
    onSuccess: async () => {
      await query.refetch();
    },
    onError: () => Alert.alert(t('commandFailedTitle'), t('commandFailedBody')),
  });
  async function journaled<T>(
    operation: MutationOperation,
    entityKey: string,
    payload: unknown,
    execute: (idempotencyKey: string, persistedPayload: unknown) => Promise<T>,
    expiresInMs?: number,
  ): Promise<T> {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new Error('AUTH_REQUIRED');
    return executeJournaledMutation({
      userId: data.user.id,
      operation,
      entityKey,
      payload,
      execute,
      ...(expiresInMs === undefined ? {} : { expiresInMs }),
    });
  }
  function submitTrustReport(intent: MarketplaceReportIntent) {
    return submitMarketplaceReport(trustClient, intent);
  }
  function transition(job: Job, status: string) {
    const transitionReason = reason.trim() || t('jobStatusUpdateReason');
    command.mutate(() =>
      journaled(
        'transition_job',
        `${job.id}:${job.version}:${status}`,
        { jobId: job.id, status, reason: transitionReason },
        (idempotencyKey, persistedPayload) => {
          const authoritative = z
            .object({
              jobId: z.uuid(),
              status: z.string(),
              reason: z.string(),
            })
            .parse(persistedPayload);
          return new MarketplaceApi(supabase).transitionJob(
            authoritative.jobId,
            authoritative.status,
            authoritative.reason,
            idempotencyKey,
          );
        },
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
    const response = await fetch(asset.uri);
    const bytes = new Uint8Array(await response.arrayBuffer());
    const mimeType = asset.mimeType ?? (asset.type === 'video' ? 'video/mp4' : 'image/jpeg');
    if (!['image/jpeg', 'image/png', 'image/webp', 'video/mp4'].includes(mimeType)) {
      throw new Error('PROOF_MEDIA_UNSUPPORTED');
    }
    const extension =
      mimeType === 'video/mp4'
        ? 'mp4'
        : mimeType === 'image/png'
          ? 'png'
          : mimeType === 'image/webp'
            ? 'webp'
            : 'jpg';
    const upload = await secureUpload({
      bytes,
      filename: `${createRandomId()}.${extension}`,
      mimeType,
      purpose: 'completion_proof',
      resourceId: job.id,
      recoveryKey: `completion-proof:${job.id}:${job.version}`,
    });
    const proofs = [
      {
        uploadId: upload.uploadId,
        description: t('completionEvidenceDescription'),
      },
    ];
    await journaled(
      'submit_completion',
      `${job.id}:${job.version}`,
      {
        jobId: job.id,
        proofs,
      },
      async (idempotencyKey, persistedPayload) => {
        const authoritative = z
          .object({
            jobId: z.uuid(),
            proofs: z.array(
              z.object({
                uploadId: z.uuid(),
                description: z.string(),
              }),
            ),
          })
          .parse(persistedPayload);
        const { error } = await supabase.rpc('submit_completion', {
          p_job_id: authoritative.jobId,
          p_proofs: authoritative.proofs,
          p_idempotency_key: idempotencyKey,
        });
        if (error) throw error;
      },
    );
  }
  async function shareCurrentLocation(job: Job) {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) throw new Error('LOCATION_PERMISSION_REQUIRED');
    setLocationStates((states) => ({
      ...states,
      [job.id]: reduceLocationSharing(states[job.id] ?? { state: 'idle' }, { type: 'REQUEST' }),
    }));
    const start = await (
      supabase.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>
    )('start_job_location_sharing', {
      p_job_id: job.id,
      p_duration_minutes: 30,
      p_consent: true,
    });
    const parsedStart = z
      .object({ sessionId: z.uuid(), expiresAt: z.string() })
      .safeParse(start.data);
    if (start.error || !parsedStart.success) throw new Error('LOCATION_SESSION_START_FAILED');
    setLocationStates((states) => ({
      ...states,
      [job.id]: reduceLocationSharing(states[job.id] ?? { state: 'requesting' }, {
        type: 'STARTED',
        ...parsedStart.data,
      }),
    }));
    const subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.Balanced,
        timeInterval: 10_000,
        distanceInterval: 25,
      },
      (position) => {
        void (
          supabase.rpc as unknown as (
            name: string,
            args: Record<string, unknown>,
          ) => Promise<{ error: unknown }>
        )('record_job_location', {
          p_job_id: job.id,
          p_session_id: parsedStart.data.sessionId,
          p_latitude: position.coords.latitude,
          p_longitude: position.coords.longitude,
          p_accuracy_m: position.coords.accuracy ?? 0,
        });
      },
    );
    const expiresIn = Math.max(0, new Date(parsedStart.data.expiresAt).getTime() - Date.now());
    const timer = setTimeout(() => {
      subscription.remove();
      delete activeLocationShares.current[job.id];
      setLocationStates((states) => ({
        ...states,
        [job.id]: reduceLocationSharing(states[job.id] ?? { state: 'idle' }, {
          type: 'EXPIRED',
        }),
      }));
      void (
        supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<unknown>
      )('stop_job_location_sharing', {
        p_session_id: parsedStart.data.sessionId,
        p_reason: 'expired',
      });
    }, expiresIn);
    activeLocationShares.current[job.id] = {
      sessionId: parsedStart.data.sessionId,
      subscription,
      timer,
    };
    Alert.alert(t('locationSharedTitle'), t('locationSharedBody'));
  }
  async function stopLocationShare(job: Job) {
    const current = locationStates[job.id];
    if (current?.state !== 'sharing') return;
    setLocationStates((states) => ({
      ...states,
      [job.id]: reduceLocationSharing(current, { type: 'STOP' }),
    }));
    const response = await (
      supabase.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ error: unknown }>
    )('stop_job_location_sharing', {
      p_session_id: current.sessionId,
      p_reason: 'provider_stopped',
    });
    if (response.error) throw new Error('LOCATION_SESSION_STOP_FAILED');
    const active = activeLocationShares.current[job.id];
    active?.subscription.remove();
    if (active) clearTimeout(active.timer);
    delete activeLocationShares.current[job.id];
    setLocationStates((states) => ({
      ...states,
      [job.id]: reduceLocationSharing(states[job.id] ?? current, { type: 'STOPPED' }),
    }));
  }
  function confirmLocationShare(job: Job) {
    Alert.alert(t('foregroundLocationTitle'), t('foregroundLocationBody'), [
      { text: t('cancel'), style: 'cancel' },
      {
        text: t('shareNow'),
        onPress: () => command.mutate(() => shareCurrentLocation(job)),
      },
    ]);
  }
  useEffect(
    () => () => {
      for (const active of Object.values(activeLocationShares.current)) {
        active.subscription.remove();
        clearTimeout(active.timer);
      }
      activeLocationShares.current = {};
    },
    [],
  );
  useEffect(() => {
    const activeJobs = new Map(query.data?.jobs.map((job) => [job.id, job.status]) ?? []);
    for (const [jobId, active] of Object.entries(activeLocationShares.current)) {
      if (activeJobs.get(jobId) === 'en_route') continue;
      active.subscription.remove();
      clearTimeout(active.timer);
      delete activeLocationShares.current[jobId];
      void (
        supabase.rpc as unknown as (name: string, args: Record<string, unknown>) => Promise<unknown>
      )('stop_job_location_sharing', {
        p_session_id: active.sessionId,
        p_reason: 'job_state_changed',
      });
    }
  }, [query.data?.jobs]);
  async function openNativeMaps(job: Job) {
    let location = locations[job.id];
    if (!location) location = await loadAuthorizedLocation(job);
    const coordinates = `${location.latitude},${location.longitude}`;
    const url =
      Platform.OS === 'ios'
        ? `https://maps.apple.com/?ll=${coordinates}`
        : `geo:${coordinates}?q=${coordinates}`;
    if (!(await Linking.canOpenURL(url))) throw new Error('MAPS_NOT_AVAILABLE');
    await Linking.openURL(url);
  }
  async function loadAuthorizedLocation(job: Job) {
    const response = await (
      supabase.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>
    )('get_authorized_job_location', { p_job_id: job.id });
    const parsed = z
      .object({
        destination: z.object({
          formattedAddress: z.string(),
          latitude: z.number(),
          longitude: z.number(),
        }),
        providerLocation: z
          .object({
            latitude: z.number(),
            longitude: z.number(),
            capturedAt: z.string(),
          })
          .nullable(),
      })
      .safeParse(response.data);
    if (response.error || !parsed.success) throw new Error('LOCATION_ACCESS_FAILED');
    const result = { ...parsed.data.destination, providerLocation: parsed.data.providerLocation };
    setLocations((current) => ({ ...current, [job.id]: result }));
    return result;
  }
  function currentEvidenceJob(job: Job): Job | undefined {
    if (!mounted.current) return undefined;
    return currentJobs.current.find(
      (current) =>
        current.id === job.id &&
        current.version === job.version &&
        current.status === 'completion_submitted',
    );
  }
  function currentEvidenceBatch(
    job: Job,
    batch: CompletionEvidenceBatch,
  ): CompletionEvidenceBatch | undefined {
    const current = evidenceBatchesRef.current[job.id];
    return isCurrentCompletionEvidence(current, currentEvidenceJob(job)) &&
      current.loadId === batch.loadId &&
      current.completionAttemptId === batch.completionAttemptId &&
      current.attemptNumber === batch.attemptNumber
      ? current
      : undefined;
  }
  function updateEvidenceBatch(
    job: Job,
    batch: CompletionEvidenceBatch,
    update: (current: CompletionEvidenceBatch) => CompletionEvidenceBatch,
  ) {
    const current = currentEvidenceBatch(job, batch);
    if (!current) return;
    evidenceBatchesRef.current = { ...evidenceBatchesRef.current, [job.id]: update(current) };
    setEvidenceBatches(evidenceBatchesRef.current);
  }
  function markProofViewed(job: Job, batch: CompletionEvidenceBatch, proofId: string) {
    updateEvidenceBatch(job, batch, (current) =>
      current.urls[proofId] && current.proofs.some((proof) => proof.id === proofId)
        ? { ...current, viewed: { ...current.viewed, [proofId]: true } }
        : current,
    );
  }
  function requireReviewedEvidence(
    job: Job,
    expected?: CompletionEvidenceBatch,
  ): CompletionEvidenceBatch {
    const batch = expected ?? evidenceBatchesRef.current[job.id];
    const current = batch ? currentEvidenceBatch(job, batch) : undefined;
    if (!current || !canAcceptCompletionEvidence(current, currentEvidenceJob(job))) {
      throw new Error('CURRENT_COMPLETION_EVIDENCE_REQUIRED');
    }
    return current;
  }
  async function loadProofs(job: Job) {
    if (!currentEvidenceJob(job)) throw new Error('COMPLETION_EVIDENCE_STALE');
    const loadId = (evidenceLoads.current[job.id] ?? 0) + 1;
    evidenceLoads.current[job.id] = loadId;
    const canLoad = () =>
      Boolean(currentEvidenceJob(job)) && evidenceLoads.current[job.id] === loadId;
    const nextBatches = { ...evidenceBatchesRef.current };
    delete nextBatches[job.id];
    evidenceBatchesRef.current = nextBatches;
    setEvidenceBatches(nextBatches);
    const response = await (
      supabase.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>
    )('get_completion_proof_manifest', { p_job_id: job.id });
    if (!canLoad()) return;
    const parsed = completionEvidenceManifestSchema.safeParse(response.data);
    if (response.error || !parsed.success) throw new Error('PROOF_MANIFEST_FAILED');
    const batch: CompletionEvidenceBatch = {
      ...parsed.data,
      jobId: job.id,
      jobVersion: job.version,
      loadId,
      urls: {},
      viewed: {},
    };
    evidenceBatchesRef.current = { ...evidenceBatchesRef.current, [job.id]: batch };
    setEvidenceBatches(evidenceBatchesRef.current);
    for (const proof of batch.proofs) {
      if (!canLoad()) return;
      const signed = await supabase.functions.invoke('media-access', {
        body: { uploadId: proof.uploadId, expiresInSeconds: 300 },
      });
      if (!canLoad()) return;
      const url = z.object({ signedUrl: z.string().url() }).safeParse(signed.data);
      if (!signed.error && url.success) {
        updateEvidenceBatch(job, batch, (current) => ({
          ...current,
          urls: { ...current.urls, [proof.id]: url.data.signedUrl },
        }));
      }
    }
  }
  async function viewVideoProof(
    job: Job,
    batch: CompletionEvidenceBatch,
    proofId: string,
    url: string,
  ) {
    if (!currentEvidenceBatch(job, batch)) return;
    if (!(await Linking.canOpenURL(url))) throw new Error('PROOF_VIEWER_UNAVAILABLE');
    if (!currentEvidenceBatch(job, batch)) return;
    await Linking.openURL(url);
    markProofViewed(job, batch, proofId);
  }
  async function accept(job: Job, accepted: boolean) {
    const reviewedBatch = accepted ? requireReviewedEvidence(job) : undefined;
    const score = Number(rating);
    const decisionReason = accepted
      ? t('customerAcceptedCompletionReason')
      : reason.trim() || t('completionNotAcceptedReason');
    const payload = {
      jobId: job.id,
      accepted,
      reason: decisionReason,
      score: accepted ? score : 1,
      review,
      evidenceUploadIds: [] as string[],
    };
    await journaled(
      'accept_completion',
      `${job.id}:${job.version}:${accepted}`,
      payload,
      async (idempotencyKey, persistedPayload) => {
        const authoritative = z
          .object({
            jobId: z.uuid(),
            accepted: z.boolean(),
            reason: z.string(),
            score: z.number().int(),
            review: z.string(),
            evidenceUploadIds: z.array(z.uuid()),
          })
          .parse(persistedPayload);
        if (authoritative.accepted) requireReviewedEvidence(job, reviewedBatch);
        const { error } = await supabase.rpc('accept_completion', {
          p_job_id: authoritative.jobId,
          p_accept: authoritative.accepted,
          p_reason: authoritative.reason,
          p_score: authoritative.score,
          p_review: authoritative.review,
          p_idempotency_key: idempotencyKey,
          p_evidence_upload_ids: authoritative.evidenceUploadIds,
        });
        if (error) throw error;
      },
    );
  }
  async function createChangeOrder(job: Job) {
    const amountMinor = Math.round(Number(changeAmount) * 100);
    if (changeDescription.trim().length < 5 || !Number.isFinite(amountMinor) || amountMinor < 0)
      throw new Error('INVALID_CHANGE_ORDER');
    const payload = {
      jobId: job.id,
      reason: t('scopeChangedReason'),
      description: changeDescription.trim(),
      lineItems: [{ description: changeDescription.trim(), quantity: 1, amountMinor }],
    };
    await journaled(
      'create_change_order',
      `${job.id}:${job.version}`,
      payload,
      async (idempotencyKey, persistedPayload) => {
        const authoritative = z.record(z.string(), z.unknown()).parse(persistedPayload);
        const { error } = await supabase.rpc('create_change_order', {
          payload: { ...authoritative, idempotencyKey },
        });
        if (error) throw error;
      },
      12 * 60 * 60 * 1000,
    );
  }
  async function decideChangeOrder(orderId: string, approve: boolean) {
    const decisionReason = approve
      ? t('customerApprovedChangeReason')
      : t('customerRejectedChangeReason');
    await journaled(
      'decide_change_order',
      `${orderId}:${approve}`,
      {
        orderId,
        approve,
        reason: decisionReason,
      },
      async (idempotencyKey, persistedPayload) => {
        const authoritative = z
          .object({
            orderId: z.uuid(),
            approve: z.boolean(),
            reason: z.string(),
          })
          .parse(persistedPayload);
        const { error } = await supabase.rpc('decide_change_order', {
          p_change_order_id: authoritative.orderId,
          p_approve: authoritative.approve,
          p_reason: authoritative.reason,
          p_idempotency_key: idempotencyKey,
        });
        if (error) throw error;
      },
    );
  }
  async function openDispute(job: Job) {
    const disputeReason = reason.trim() || t('jobDisputeReason');
    await journaled(
      'open_dispute',
      `${job.id}:${job.version}`,
      {
        jobId: job.id,
        reason: disputeReason,
        expectedVersion: job.version,
      },
      async (idempotencyKey, persistedPayload) => {
        const authoritative = z
          .object({
            jobId: z.uuid(),
            reason: z.string(),
            expectedVersion: z.number().int(),
          })
          .parse(persistedPayload);
        const { error } = await supabase.rpc('open_dispute', {
          p_job_id: authoritative.jobId,
          p_reason: authoritative.reason,
          p_expected_version: authoritative.expectedVersion,
          p_idempotency_key: idempotencyKey,
        });
        if (error) throw error;
      },
    );
  }
  async function requestCancellation(job: Job) {
    const cancellationReason = reason.trim() || t('jobCancellationReason');
    await journaled(
      'request_cancellation',
      `${job.id}:${job.version}`,
      {
        jobId: job.id,
        reason: cancellationReason,
        expectedVersion: job.version,
      },
      async (idempotencyKey, persistedPayload) => {
        const authoritative = z
          .object({
            jobId: z.uuid(),
            reason: z.string(),
            expectedVersion: z.number().int(),
          })
          .parse(persistedPayload);
        const { error } = await supabase.rpc('request_job_cancellation', {
          p_job_id: authoritative.jobId,
          p_reason: authoritative.reason,
          p_expected_version: authoritative.expectedVersion,
          p_idempotency_key: idempotencyKey,
        });
        if (error) throw error;
      },
    );
  }
  return (
    <ScrollView contentContainerStyle={{ flexGrow: 1 }}>
      <Screen>
        <Text style={styles.title}>{t('jobs')}</Text>
        {scope.success ? (
          <Button
            disabled={query.isFetching || command.isPending}
            kind="secondary"
            label={t('refreshStatus')}
            onPress={() => void query.refetch()}
          />
        ) : null}
        <TextInput
          style={styles.input}
          value={reason}
          onChangeText={setReason}
          placeholder={t('actionReasonPlaceholder')}
        />
        {scope.success && query.isPending && <LoadingSkeleton label={t('loadingJobs')} />}
        {!scope.success && (
          <Text accessibilityRole="alert" style={styles.error}>
            {t('noJobs')}
          </Text>
        )}
        {query.isError && (
          <Card>
            <Text accessibilityRole="alert" style={styles.error}>
              {t(
                query.error instanceof Error && query.error.message === 'AUTH_REQUIRED'
                  ? 'signInToLoadJobs'
                  : 'jobLoadFailed',
              )}
            </Text>
            <Button kind="secondary" label={t('retry')} onPress={() => void query.refetch()} />
          </Card>
        )}
        {query.data?.jobs.map((job) => {
          const customer = job.customer_id === query.data?.userId;
          const openCancellation = job.cancellation_requests.find((item) =>
            ['pending', 'financial_pending'].includes(item.status),
          );
          const latestCancellation = openCancellation ?? job.cancellation_requests[0];
          const openDisputeCase = job.disputes.find(
            (item) => !['resolved', 'closed'].includes(item.status),
          );
          const latestDispute = openDisputeCase ?? job.disputes[0];
          const loadedEvidence = evidenceBatches[job.id];
          const batch = isCurrentCompletionEvidence(loadedEvidence, job)
            ? loadedEvidence
            : undefined;
          const jobProofs = batch?.proofs ?? [];
          const timelineIndex = resolveTimelineIndex(jobTimelineStatuses, job.status);
          const allProofsViewed = canAcceptCompletionEvidence(batch, job);
          const next =
            customer && job.status === 'provider_selected'
              ? 'scheduled'
              : !customer
                ? providerNext[job.status]
                : undefined;
          const reportableRatings =
            !customer && job.status === 'completed'
              ? job.ratings.filter(
                  (item) =>
                    item.provider_id === query.data?.userId && item.customer_id === job.customer_id,
                )
              : [];
          return (
            <Card key={job.id}>
              {customer ? (
                <CustomerJobStatus
                  active={activeScreen && Boolean(params.jobId || params.requestId)}
                  status={job.status}
                />
              ) : (
                <Text style={styles.badge}>{formatStatusLabel(job.status, locale)}</Text>
              )}
              {!customer && timelineIndex !== null ? (
                <ProgressTimeline
                  currentIndex={timelineIndex}
                  steps={jobTimelineStatuses.map((status) => ({
                    id: status,
                    label: formatStatusLabel(status, locale),
                  }))}
                />
              ) : null}
              <Text>
                {t('approvedTotal', { amount: formatSar(job.approved_total_minor, locale) })}
              </Text>
              {job.payments[0] && (
                <Text style={styles.lead}>
                  {t('paymentBalanceSummary', {
                    status: formatStatusLabel(job.payments[0].status, locale),
                    refunded: formatSar(job.payments[0].refunded_minor, locale),
                    net: formatSar(
                      job.payments[0].amount_minor - job.payments[0].refunded_minor,
                      locale,
                    ),
                  })}
                </Text>
              )}
              <Text style={styles.lead}>
                {t('jobRoleSummary', {
                  version: job.version,
                  role: customer ? t('customer') : t('provider'),
                })}
              </Text>
              <Text style={styles.lead} accessibilityLiveRegion="polite">
                {t('cancellationStatus')}:{' '}
                {latestCancellation
                  ? t(cancellationStatusKeys[latestCancellation.status] ?? 'noOpenCancellation')
                  : t('noOpenCancellation')}
              </Text>
              <Text style={styles.lead} accessibilityLiveRegion="polite">
                {t('disputeStatus')}:{' '}
                {latestDispute
                  ? t(disputeStatusKeys[latestDispute.status] ?? 'noOpenDispute')
                  : t('noOpenDispute')}
              </Text>
              {next && (
                <Button
                  disabled={command.isPending}
                  label={actionLabelKeys[next] ? t(actionLabelKeys[next]) : next}
                  onPress={() => transition(job, next)}
                />
              )}
              {!customer && job.status === 'en_route' && (
                <Button
                  kind="secondary"
                  disabled={command.isPending}
                  label={t('shareLocationOnce')}
                  onPress={() => confirmLocationShare(job)}
                />
              )}
              <Button
                kind="secondary"
                label={locations[job.id] ? t('openJobMaps') : t('loadExactJobLocation')}
                onPress={() =>
                  command.mutate(() =>
                    locations[job.id] ? openNativeMaps(job) : loadAuthorizedLocation(job),
                  )
                }
              />
              {locationStates[job.id]?.state === 'sharing' && !customer && (
                <Button
                  kind="secondary"
                  label={t('stopLocationSharing')}
                  onPress={() => command.mutate(() => stopLocationShare(job))}
                />
              )}
              {customer && job.status === 'en_route' && <JobTrackingMap jobId={job.id} />}
              {!customer && job.status === 'diagnosing' && (
                <>
                  <TextInput
                    accessibilityLabel={t('changeScopeDescription')}
                    style={styles.input}
                    value={changeDescription}
                    onChangeText={setChangeDescription}
                    placeholder={t('changeScopeDescription')}
                  />
                  <TextInput
                    style={styles.input}
                    value={changeAmount}
                    onChangeText={setChangeAmount}
                    keyboardType="decimal-pad"
                    placeholder={t('additionalAmountSar')}
                  />
                  <Button
                    kind="secondary"
                    label={t('sendChangeOrder')}
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
                        {t('revisedTotal', {
                          amount: formatSar(order.revised_total_minor, locale),
                        })}
                      </Text>
                      <View style={styles.row}>
                        <Button
                          label={t('approve')}
                          onPress={() => command.mutate(() => decideChangeOrder(order.id, true))}
                        />
                        <Button
                          kind="danger"
                          label={t('reject')}
                          onPress={() => command.mutate(() => decideChangeOrder(order.id, false))}
                        />
                      </View>
                    </Card>
                  ))}
              {!customer && job.status === 'in_progress' && (
                <Button
                  label={t('uploadCompletionProof')}
                  onPress={() => command.mutate(() => submitCompletion(job))}
                />
              )}
              {customer && job.status === 'completion_submitted' && (
                <>
                  <Button
                    kind="secondary"
                    label={t('viewCompletionProof')}
                    onPress={() => command.mutate(() => loadProofs(job))}
                  />
                  {jobProofs.map((proof) => (
                    <Card key={proof.id}>
                      {batch?.urls[proof.id] ? (
                        proof.mimeType.startsWith('image/') ? (
                          <Image
                            source={{ uri: batch.urls[proof.id] }}
                            accessibilityLabel={t('completionProofA11y')}
                            onLoad={() => markProofViewed(job, batch, proof.id)}
                            style={{ width: '100%', height: 220, borderRadius: 12 }}
                          />
                        ) : (
                          <Button
                            kind="secondary"
                            label={t('openVideoEvidence')}
                            onPress={() =>
                              command.mutate(() =>
                                viewVideoProof(job, batch, proof.id, batch.urls[proof.id] ?? ''),
                              )
                            }
                          />
                        )
                      ) : (
                        <Button
                          kind="secondary"
                          label={t('retryMedia')}
                          onPress={() => command.mutate(() => loadProofs(job))}
                        />
                      )}
                      {proof.description && <Text style={styles.lead}>{proof.description}</Text>}
                    </Card>
                  ))}
                  <TextInput
                    accessibilityLabel={t('ratingPlaceholder')}
                    style={styles.input}
                    value={rating}
                    onChangeText={setRating}
                    keyboardType="number-pad"
                    placeholder={t('ratingPlaceholder')}
                  />
                  <TextInput
                    accessibilityLabel={t('optionalReview')}
                    style={styles.input}
                    value={review}
                    onChangeText={setReview}
                    placeholder={t('optionalReview')}
                  />
                  <View style={styles.row}>
                    <Button
                      disabled={!allProofsViewed || command.isPending}
                      label={t('acceptCompletion')}
                      onPress={() => command.mutate(() => accept(job, true))}
                    />
                    <Button
                      disabled={command.isPending}
                      kind="danger"
                      label={t('rejectAndOpenDispute')}
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
                  <Button kind="secondary" label={t('openConversation')} />
                </Link>
              )}
              {reportableRatings.map((item) => (
                <Card key={item.id}>
                  <Text style={styles.lead}>{t('trustRatingTitle')}</Text>
                  <Text>{t('trustRatingScore', { score: item.score })}</Text>
                  {item.review ? <Text style={styles.lead}>{item.review}</Text> : null}
                  <TrustControls
                    onCompleted={async () => {
                      await query.refetch();
                    }}
                    onSubmitReport={submitTrustReport}
                    target={{ targetType: 'rating', targetId: item.id }}
                  />
                </Card>
              ))}
              {!['completed', 'cancelled', 'disputed'].includes(job.status) &&
                !openCancellation && (
                  <Button
                    kind="danger"
                    label={t('requestCancellation')}
                    onPress={() => command.mutate(() => requestCancellation(job))}
                  />
                )}
              {!openDisputeCase && (
                <Button
                  kind="danger"
                  label={t('dispute')}
                  onPress={() => command.mutate(() => openDispute(job))}
                />
              )}
            </Card>
          );
        })}
        {!query.isPending && query.data?.jobs.length === 0 && (
          <Card>
            <Text style={styles.lead}>{t('noJobs')}</Text>
          </Card>
        )}
      </Screen>
    </ScrollView>
  );
}
