import { useEffect, useRef, useState } from 'react';
import { Link } from 'expo-router';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Alert, Image, Linking, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Location from 'expo-location';
import { z } from 'zod';
import { MarketplaceApi } from '@sallah/api';
import { formatSar, formatStatusLabel, type TranslationKey } from '@sallah/i18n';
import { Button, Card, LoadingSkeleton, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { secureUpload } from '@/lib/secure-upload';
import { useLocale } from '@/providers/locale-provider';
import { reduceLocationSharing, type LocationSharingState } from '@/features/jobs/location-sharing';
import { JobTrackingMap } from '@/features/jobs/job-tracking-map';
import { allCompletionEvidenceViewed } from '@/features/jobs/completion-evidence';
import { executeJournaledMutation, type MutationOperation } from '@/lib/mutation-journal';
import type { MarketplaceReportIntent } from '@sallah/domain/trust';
import { TrustControls } from '../src/features/trust/trust-controls';
import { createTrustRpcClient, submitMarketplaceReport } from '../src/features/trust/trust-client';

const trustClient = createTrustRpcClient(supabase);

const changeOrderSchema = z.object({
  id: z.uuid(),
  reason: z.string(),
  description: z.string(),
  revised_total_minor: z.number().int(),
  status: z.string(),
  expires_at: z.string(),
});
const ratingSchema = z.object({
  id: z.uuid(),
  customer_id: z.uuid(),
  provider_id: z.uuid(),
  score: z.number().int().min(1).max(5),
  review: z.string().nullable(),
  moderation_status: z.string(),
});
const jobSchema = z.object({
  id: z.uuid(),
  customer_id: z.uuid(),
  provider_id: z.uuid(),
  status: z.string(),
  approved_total_minor: z.number().int(),
  version: z.number().int(),
  created_at: z.string(),
  payments: z
    .array(
      z.object({
        amount_minor: z.number().int(),
        refunded_minor: z.number().int().default(0),
        status: z.string(),
      }),
    )
    .default([]),
  conversations: z.array(z.object({ id: z.uuid() })),
  job_location_updates: z
    .array(z.object({ captured_at: z.string(), expires_at: z.string() }))
    .default([]),
  change_orders: z.array(changeOrderSchema),
  cancellation_requests: z
    .array(
      z.object({
        id: z.uuid(),
        status: z.string(),
        reason: z.string(),
        created_at: z.string(),
      }),
    )
    .default([]),
  disputes: z
    .array(
      z.object({
        id: z.uuid(),
        status: z.string(),
        reason: z.string(),
        created_at: z.string(),
        resolved_at: z.string().nullable(),
      }),
    )
    .default([]),
  ratings: z.array(ratingSchema).default([]),
});
type Job = z.infer<typeof jobSchema>;
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

export default function Jobs() {
  const { locale, t } = useLocale();
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
  const [proofs, setProofs] = useState<
    Record<
      string,
      Array<{
        id: string;
        uploadId: string;
        mimeType: string;
        description: string | null;
      }>
    >
  >({});
  const [proofUrls, setProofUrls] = useState<Record<string, string>>({});
  const [proofViewed, setProofViewed] = useState<Record<string, boolean>>({});
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
    queryKey: ['jobs'],
    queryFn: async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) throw new Error('AUTH_REQUIRED');
      const { data, error } = await supabase
        .from('jobs')
        .select(
          'id,customer_id,provider_id,status,approved_total_minor,version,created_at,payments(amount_minor,refunded_minor,status),conversations(id),job_location_updates(captured_at,expires_at),change_orders(id,reason,description,revised_total_minor,status,expires_at),cancellation_requests(id,status,reason,created_at),disputes(id,status,reason,created_at,resolved_at),ratings(id,customer_id,provider_id,score,review,moderation_status)',
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
    onError: () => Alert.alert(t('commandFailedTitle'), t('commandFailedBody')),
  });
  async function journaled<T>(
    operation: MutationOperation,
    entityKey: string,
    payload: unknown,
    execute: (idempotencyKey: string, persistedPayload: unknown) => Promise<T>,
  ): Promise<T> {
    const { data } = await supabase.auth.getUser();
    if (!data.user) throw new Error('AUTH_REQUIRED');
    return executeJournaledMutation({
      userId: data.user.id,
      operation,
      entityKey,
      payload,
      execute,
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
    const mimeType = asset.mimeType ?? 'image/jpeg';
    const extension = mimeType === 'video/mp4' ? 'mp4' : mimeType === 'image/png' ? 'png' : 'jpg';
    const upload = await secureUpload({
      bytes,
      filename: `${globalThis.crypto.randomUUID()}.${extension}`,
      mimeType,
      purpose: 'completion_proof',
      resourceId: job.id,
    });
    const proofs = [
      {
        uploadId: upload.uploadId,
        storagePath: upload.storagePath,
        mimeType: upload.mimeType,
        sizeBytes: upload.sizeBytes,
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
                storagePath: z.string(),
                mimeType: z.string(),
                sizeBytes: z.number().int(),
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
  async function loadProofs(job: Job) {
    const response = await (
      supabase.rpc as unknown as (
        name: string,
        args: Record<string, unknown>,
      ) => Promise<{ data: unknown; error: unknown }>
    )('get_completion_proof_manifest', { p_job_id: job.id });
    const parsed = z
      .object({
        proofs: z.array(
          z.object({
            id: z.uuid(),
            uploadId: z.uuid(),
            mimeType: z.string(),
            description: z.string().nullable(),
          }),
        ),
      })
      .safeParse(response.data);
    if (response.error || !parsed.success) throw new Error('PROOF_MANIFEST_FAILED');
    setProofs((current) => ({ ...current, [job.id]: parsed.data.proofs }));
    for (const proof of parsed.data.proofs) {
      const signed = await supabase.functions.invoke('media-access', {
        body: { uploadId: proof.uploadId, expiresInSeconds: 300 },
      });
      const url = z.object({ signedUrl: z.string().url() }).safeParse(signed.data);
      if (!signed.error && url.success) {
        setProofUrls((current) => ({ ...current, [proof.id]: url.data.signedUrl }));
      }
    }
  }
  async function viewVideoProof(proofId: string, url: string) {
    if (!(await Linking.canOpenURL(url))) throw new Error('PROOF_VIEWER_UNAVAILABLE');
    await Linking.openURL(url);
    setProofViewed((current) => ({ ...current, [proofId]: true }));
  }
  async function accept(job: Job, accepted: boolean) {
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
      expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
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
        <TextInput
          style={styles.input}
          value={reason}
          onChangeText={setReason}
          placeholder={t('actionReasonPlaceholder')}
        />
        {query.isPending && <LoadingSkeleton label={t('loadingJobs')} />}
        {query.isError && <Text style={styles.error}>{t('signInToLoadJobs')}</Text>}
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
          const jobProofs = proofs[job.id] ?? [];
          const allProofsViewed = allCompletionEvidenceViewed(
            jobProofs.map((proof) => proof.id),
            proofViewed,
          );
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
              <Text style={styles.badge}>{formatStatusLabel(job.status, locale)}</Text>
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
                      {proofUrls[proof.id] ? (
                        proof.mimeType.startsWith('image/') ? (
                          <Image
                            source={{ uri: proofUrls[proof.id] }}
                            accessibilityLabel={t('completionProofA11y')}
                            onLoad={() =>
                              setProofViewed((current) => ({
                                ...current,
                                [proof.id]: true,
                              }))
                            }
                            style={{ width: '100%', height: 220, borderRadius: 12 }}
                          />
                        ) : (
                          <Button
                            kind="secondary"
                            label={t('openVideoEvidence')}
                            onPress={() =>
                              command.mutate(() =>
                                viewVideoProof(proof.id, proofUrls[proof.id] ?? ''),
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
                    style={styles.input}
                    value={rating}
                    onChangeText={setRating}
                    keyboardType="number-pad"
                    placeholder={t('ratingPlaceholder')}
                  />
                  <TextInput
                    style={styles.input}
                    value={review}
                    onChangeText={setReview}
                    placeholder={t('optionalReview')}
                  />
                  <View style={styles.row}>
                    <Button
                      disabled={!allProofsViewed}
                      label={t('acceptCompletion')}
                      onPress={() => command.mutate(() => accept(job, true))}
                    />
                    <Button
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
