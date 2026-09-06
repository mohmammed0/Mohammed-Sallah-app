import { useCallback, useEffect, useRef, useState } from 'react';
import { FlatList, Image, ScrollView, Text, TextInput, View } from 'react-native';
import { Link, useLocalSearchParams } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { z } from 'zod';
import { Button, Card, Screen, styles } from '@/components/ui';
import { supabase } from '@/lib/supabase';
import { useLocale } from '@/providers/locale-provider';
import { secureUpload, type CleanUpload } from '@/lib/secure-upload';
import { REALTIME_SUBSCRIBE_STATES } from '@supabase/supabase-js';
import type {
  MarketplaceReportIntent,
  MarketplaceTrustContext,
  UserBlockResult,
} from '@sallah/domain/trust';
import { TrustControls } from '../src/features/trust/trust-controls';
import {
  createTrustRpcClient,
  loadMarketplaceTrustContext,
  setMarketplaceUserBlocked,
  submitMarketplaceReport,
} from '../src/features/trust/trust-client';
const attachmentSchema = z.object({
  id: z.uuid(),
  file_upload_id: z.uuid(),
  mime_type: z.string(),
  size_bytes: z.number(),
});
const messageSchema = z
  .object({
    id: z.uuid(),
    body: z.string(),
    sender_id: z.uuid(),
    created_at: z.string(),
    message_attachments: z.array(attachmentSchema),
  })
  .strict();
const messageInsertEnvelopeSchema = z.object({ id: z.uuid() });
type Message = z.infer<typeof messageSchema>;
type ExactMessageLoadResult =
  | { kind: 'found'; message: Message }
  | { kind: 'definitive_absence' }
  | { kind: 'recoverable_failure' };
const messageProjection =
  'id,body,sender_id,created_at,message_attachments(id,file_upload_id,mime_type,size_bytes)' as const;
const conversationSchema = z.object({
  id: z.uuid(),
  job_id: z.uuid(),
  created_at: z.string(),
});
const protectedMediaGrantSchema = z.object({
  signedUrl: z.string().url(),
  deliveryMode: z.enum(['signed_url', 'authenticated_proxy']).optional(),
  expiresAt: z.iso.datetime({ offset: true }),
});
const trustClient = createTrustRpcClient(supabase);

type ProtectedMediaGrant = {
  uri: string;
  expiresAt: number;
};

type SafeActionFeedback = {
  general: string;
  send: string;
  upload: string;
};

type ConversationLocalState = {
  conversationId: string | undefined;
  messages: Message[];
  body: string;
  actionFeedback: SafeActionFeedback;
  snapshotError: string;
  attachment: CleanUpload | null;
  mediaGrants: Record<string, ProtectedMediaGrant>;
};

type LocalBlockResult = {
  conversationId: string;
  targetUserId: string;
  blockedByMe: boolean;
  canCommunicate: boolean;
};

function emptyConversationState(conversationId: string | undefined): ConversationLocalState {
  return {
    conversationId,
    messages: [],
    body: '',
    actionFeedback: { general: '', send: '', upload: '' },
    snapshotError: '',
    attachment: null,
    mediaGrants: {},
  };
}

function mergeMessages(current: readonly Message[], incoming: readonly Message[]): Message[] {
  const byId = new Map(current.map((message) => [message.id, message]));
  for (const message of incoming) byId.set(message.id, message);
  return [...byId.values()]
    .sort(
      (left, right) =>
        Date.parse(right.created_at) - Date.parse(left.created_at) ||
        right.id.localeCompare(left.id),
    )
    .slice(0, 50);
}

async function loadMessageSnapshot(conversationId: string) {
  return await supabase
    .from('messages')
    .select(messageProjection)
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(50);
}

async function loadExactMessage(
  conversationId: string,
  messageId: string,
): Promise<ExactMessageLoadResult> {
  try {
    const response = await supabase
      .from('messages')
      .select(messageProjection)
      .eq('conversation_id', conversationId)
      .eq('id', messageId)
      .maybeSingle();
    if (response.error?.code === '42501') return { kind: 'definitive_absence' };
    if (response.error) return { kind: 'recoverable_failure' };
    if (response.data === null) return { kind: 'definitive_absence' };
    const parsed = messageSchema.safeParse(response.data);
    return parsed.success
      ? { kind: 'found', message: parsed.data }
      : { kind: 'recoverable_failure' };
  } catch {
    return { kind: 'recoverable_failure' };
  }
}

export default function Messages() {
  const { locale, t } = useLocale();
  const { conversationId } = useLocalSearchParams<{ conversationId?: string }>();
  const [conversationState, setConversationState] = useState<ConversationLocalState>(() =>
    emptyConversationState(conversationId),
  );
  const [conversations, setConversations] = useState<z.infer<typeof conversationSchema>[]>([]);
  const [trustContext, setTrustContext] = useState<MarketplaceTrustContext | null>(null);
  const [trustLoading, setTrustLoading] = useState(Boolean(conversationId));
  const [trustContextFailedFor, setTrustContextFailedFor] = useState<string | null>(null);
  const [trustRefreshFailedFor, setTrustRefreshFailedFor] = useState<string | null>(null);
  const [localBlockResult, setLocalBlockResult] = useState<LocalBlockResult | null>(null);
  const trustRequestGeneration = useRef(0);
  const messageRequestGeneration = useRef(0);
  const snapshotReconciliationRef = useRef<{
    conversationId: string;
    request: () => void;
  } | null>(null);
  const mediaRequestGeneration = useRef(0);
  const composerEligibilityGeneration = useRef(0);
  const sendOperationGeneration = useRef(0);
  const uploadOperationGeneration = useRef(0);
  const previouslyCouldCommunicate = useRef(false);
  const mediaInFlight = useRef(
    new Map<string, { conversationId: string; generation: number; token: symbol }>(),
  );
  const activeConversationIdRef = useRef(conversationId);
  activeConversationIdRef.current = conversationId;
  const activeConversationState =
    conversationState.conversationId === conversationId
      ? conversationState
      : emptyConversationState(conversationId);
  const { messages, body, actionFeedback, snapshotError, attachment, mediaGrants } =
    activeConversationState;
  const hasActionFeedback = Boolean(
    actionFeedback.general || actionFeedback.send || actionFeedback.upload,
  );
  const mediaGrantsRef = useRef(mediaGrants);
  mediaGrantsRef.current = mediaGrants;
  const updateConversationState = useCallback(
    (
      targetConversationId: string | undefined,
      update: (current: ConversationLocalState) => ConversationLocalState,
    ) => {
      setConversationState((current) =>
        current.conversationId === targetConversationId ? update(current) : current,
      );
    },
    [],
  );
  const refreshTrustContext = useCallback(
    async (options?: { preserveExisting?: boolean }) => {
      const activeConversationId = conversationId;
      if (activeConversationIdRef.current !== activeConversationId) return;
      const requestGeneration = ++trustRequestGeneration.current;
      const preserveExisting = options?.preserveExisting === true;
      if (!preserveExisting) setTrustContext(null);
      updateConversationState(activeConversationId, (current) => ({
        ...current,
        mediaGrants: {},
      }));
      if (!activeConversationId) {
        setTrustLoading(false);
        setTrustContextFailedFor(null);
        setTrustRefreshFailedFor(null);
        return;
      }
      setTrustLoading(true);
      setTrustContextFailedFor(null);
      setTrustRefreshFailedFor(null);
      try {
        const context = await loadMarketplaceTrustContext(trustClient, activeConversationId);
        if (
          requestGeneration !== trustRequestGeneration.current ||
          activeConversationIdRef.current !== activeConversationId
        ) {
          return;
        }
        if (context.conversationId !== activeConversationId) {
          throw new Error('TRUST_CONTEXT_CONVERSATION_MISMATCH');
        }
        setTrustContext(context);
        setLocalBlockResult(null);
      } catch {
        if (
          requestGeneration !== trustRequestGeneration.current ||
          activeConversationIdRef.current !== activeConversationId
        ) {
          return;
        }
        if (preserveExisting) {
          setTrustRefreshFailedFor(activeConversationId);
        } else {
          setTrustContext(null);
          setTrustContextFailedFor(activeConversationId);
        }
      } finally {
        if (
          requestGeneration === trustRequestGeneration.current &&
          activeConversationIdRef.current === activeConversationId
        ) {
          setTrustLoading(false);
        }
      }
    },
    [conversationId, trustClient, updateConversationState],
  );
  const refreshAfterMutation = useCallback(
    () => refreshTrustContext({ preserveExisting: true }),
    [refreshTrustContext],
  );
  const activeTrustContext = trustContext?.conversationId === conversationId ? trustContext : null;
  const activeBlockResult =
    localBlockResult &&
    localBlockResult.conversationId === conversationId &&
    localBlockResult.targetUserId === activeTrustContext?.counterpartyUserId
      ? localBlockResult
      : null;
  const effectiveBlockedByMe = activeBlockResult?.blockedByMe ?? activeTrustContext?.blockedByMe;
  const effectiveCanCommunicate =
    (activeBlockResult?.canCommunicate ?? activeTrustContext?.canCommunicate) === true;
  const canCommunicateRef = useRef(effectiveCanCommunicate);
  canCommunicateRef.current = effectiveCanCommunicate;
  const trustContextFailed = trustContextFailedFor === conversationId;
  const trustRefreshFailed = trustRefreshFailedFor === conversationId;
  const loadSignedUrl = useCallback(
    async (uploadId: string) => {
      const activeConversationId = conversationId;
      if (!activeConversationId || !canCommunicateRef.current) return;
      const currentGrant = mediaGrantsRef.current[uploadId];
      if (currentGrant && currentGrant.expiresAt > Date.now()) return;
      const generation = mediaRequestGeneration.current;
      const existing = mediaInFlight.current.get(uploadId);
      if (existing?.conversationId === activeConversationId && existing.generation === generation) {
        return;
      }
      const token = Symbol(uploadId);
      mediaInFlight.current.set(uploadId, {
        conversationId: activeConversationId,
        generation,
        token,
      });
      try {
        const response = await supabase.functions.invoke('media-access', {
          body: { uploadId, expiresInSeconds: 300 },
        });
        const parsed = protectedMediaGrantSchema.safeParse(response.data);
        const expiresAt = parsed.success ? Date.parse(parsed.data.expiresAt) : Number.NaN;
        const isCurrentRequest =
          mediaInFlight.current.get(uploadId)?.token === token &&
          generation === mediaRequestGeneration.current;
        if (
          !response.error &&
          parsed.success &&
          expiresAt > Date.now() &&
          isCurrentRequest &&
          activeConversationIdRef.current === activeConversationId &&
          canCommunicateRef.current
        ) {
          updateConversationState(activeConversationId, (current) => ({
            ...current,
            mediaGrants: {
              ...current.mediaGrants,
              [uploadId]: { uri: parsed.data.signedUrl, expiresAt },
            },
          }));
        }
      } finally {
        if (mediaInFlight.current.get(uploadId)?.token === token) {
          mediaInFlight.current.delete(uploadId);
        }
      }
    },
    [conversationId, updateConversationState],
  );
  const invalidateMediaGrant = useCallback(
    (uploadId: string) => {
      updateConversationState(conversationId, (current) => {
        if (!current.mediaGrants[uploadId]) return current;
        const next = { ...current.mediaGrants };
        delete next[uploadId];
        return { ...current, mediaGrants: next };
      });
    },
    [conversationId, updateConversationState],
  );
  const retryMessageSnapshot = useCallback((targetConversationId: string) => {
    const controller = snapshotReconciliationRef.current;
    if (
      activeConversationIdRef.current !== targetConversationId ||
      controller?.conversationId !== targetConversationId
    ) {
      return;
    }
    controller.request();
  }, []);
  useEffect(() => {
    messageRequestGeneration.current += 1;
    mediaRequestGeneration.current += 1;
    composerEligibilityGeneration.current += 1;
    sendOperationGeneration.current += 1;
    uploadOperationGeneration.current += 1;
    previouslyCouldCommunicate.current = false;
    mediaInFlight.current.clear();
    setConversationState(emptyConversationState(conversationId));
    setLocalBlockResult(null);
  }, [conversationId]);
  useEffect(() => {
    if (previouslyCouldCommunicate.current && !effectiveCanCommunicate) {
      composerEligibilityGeneration.current += 1;
    }
    previouslyCouldCommunicate.current = effectiveCanCommunicate;
  }, [effectiveCanCommunicate]);
  useEffect(() => {
    void refreshTrustContext();
    return () => {
      trustRequestGeneration.current += 1;
    };
  }, [refreshTrustContext]);
  useEffect(() => {
    if (conversationId) return;
    void supabase
      .from('conversations')
      .select('id,job_id,created_at')
      .order('created_at', { ascending: false })
      .limit(50)
      .then(({ data, error: queryError }) => {
        const parsed = z.array(conversationSchema).safeParse(data ?? []);
        if (queryError || !parsed.success) {
          updateConversationState(undefined, (current) => ({
            ...current,
            actionFeedback: {
              ...current.actionFeedback,
              general: t('messagesLoadFailed'),
            },
          }));
        } else setConversations(parsed.data);
      });
  }, [conversationId, t, updateConversationState]);
  useEffect(() => {
    if (!conversationId) return;
    const activeConversationId = conversationId;
    const requestGeneration = ++messageRequestGeneration.current;
    const isCurrentRequest = () =>
      requestGeneration === messageRequestGeneration.current &&
      activeConversationIdRef.current === activeConversationId;
    const reconcileSnapshotOnce = async () => {
      if (!isCurrentRequest()) return;
      let response: Awaited<ReturnType<typeof loadMessageSnapshot>>;
      try {
        response = await loadMessageSnapshot(activeConversationId);
      } catch {
        if (!isCurrentRequest()) return;
        updateConversationState(activeConversationId, (current) => ({
          ...current,
          snapshotError: t('messagesLoadFailed'),
        }));
        return;
      }
      if (!isCurrentRequest()) return;
      const { data, error: queryError } = response;
      if (queryError) {
        updateConversationState(activeConversationId, (current) => ({
          ...current,
          snapshotError: t('messagesLoadFailed'),
        }));
        return;
      }
      const parsed = z.array(messageSchema).safeParse(data ?? []);
      if (parsed.success) {
        updateConversationState(activeConversationId, (current) => ({
          ...current,
          messages: mergeMessages(current.messages, parsed.data),
          snapshotError: '',
        }));
      } else {
        updateConversationState(activeConversationId, (current) => ({
          ...current,
          snapshotError: t('messagesInvalid'),
        }));
      }
    };
    let reconciliationInFlight = false;
    let reconciliationTrailing = false;
    const requestSnapshotReconciliation = () => {
      if (!isCurrentRequest()) return;
      if (reconciliationInFlight) {
        reconciliationTrailing = true;
        return;
      }
      reconciliationInFlight = true;
      void (async () => {
        try {
          do {
            reconciliationTrailing = false;
            await reconcileSnapshotOnce();
          } while (reconciliationTrailing && isCurrentRequest());
        } finally {
          reconciliationInFlight = false;
          reconciliationTrailing = false;
        }
      })();
    };
    const snapshotController = {
      conversationId: activeConversationId,
      request: requestSnapshotReconciliation,
    };
    snapshotReconciliationRef.current = snapshotController;
    const reconcileExactMessage = async (messageId: string) => {
      if (!isCurrentRequest()) return;
      const result = await loadExactMessage(activeConversationId, messageId);
      if (!isCurrentRequest()) return;
      switch (result.kind) {
        case 'found':
          updateConversationState(activeConversationId, (current) => ({
            ...current,
            messages: mergeMessages(current.messages, [result.message]),
          }));
          return;
        case 'recoverable_failure':
          requestSnapshotReconciliation();
          return;
        case 'definitive_absence':
          return;
      }
    };
    const channel = supabase
      .channel(`conversation:${activeConversationId}`)
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'messages',
          filter: `conversation_id=eq.${activeConversationId}`,
        },
        ({ new: row }) => {
          if (!isCurrentRequest()) return;
          const parsed = messageInsertEnvelopeSchema.safeParse(row);
          if (parsed.success) void reconcileExactMessage(parsed.data.id);
        },
      )
      .subscribe((status) => {
        if (status !== REALTIME_SUBSCRIBE_STATES.SUBSCRIBED || !isCurrentRequest()) return;
        requestSnapshotReconciliation();
      });
    requestSnapshotReconciliation();
    return () => {
      if (snapshotReconciliationRef.current === snapshotController) {
        snapshotReconciliationRef.current = null;
      }
      messageRequestGeneration.current += 1;
      void supabase.removeChannel(channel);
    };
  }, [conversationId, t, updateConversationState]);
  useEffect(() => {
    if (!effectiveCanCommunicate) {
      mediaRequestGeneration.current += 1;
      mediaInFlight.current.clear();
      if (Object.keys(mediaGrants).length) {
        updateConversationState(conversationId, (current) => ({
          ...current,
          mediaGrants: {},
        }));
      }
      return;
    }
    const now = Date.now();
    const attachmentIds = new Set<string>();
    for (const message of messages) {
      for (const item of message.message_attachments) {
        attachmentIds.add(item.file_upload_id);
        const grant = mediaGrants[item.file_upload_id];
        if (!grant || grant.expiresAt <= now) void loadSignedUrl(item.file_upload_id);
      }
    }
    const nextExpiry = Object.entries(mediaGrants)
      .filter(([uploadId, grant]) => attachmentIds.has(uploadId) && grant.expiresAt > now)
      .reduce<number | null>(
        (nearest, [, grant]) =>
          nearest === null ? grant.expiresAt : Math.min(nearest, grant.expiresAt),
        null,
      );
    if (nextExpiry === null) return;
    const timer = setTimeout(
      () => {
        updateConversationState(conversationId, (current) => {
          const next = Object.fromEntries(
            Object.entries(current.mediaGrants).filter(([, grant]) => grant.expiresAt > Date.now()),
          );
          return Object.keys(next).length === Object.keys(current.mediaGrants).length
            ? current
            : { ...current, mediaGrants: next };
        });
      },
      Math.min(Math.max(nextExpiry - now, 0), 2_147_000_000),
    );
    return () => clearTimeout(timer);
  }, [
    conversationId,
    effectiveCanCommunicate,
    loadSignedUrl,
    mediaGrants,
    messages,
    updateConversationState,
  ]);
  async function pickAttachment() {
    const activeConversationId = conversationId;
    if (!activeConversationId || !canCommunicateRef.current) return;
    const operationGeneration = ++uploadOperationGeneration.current;
    const eligibilityGeneration = composerEligibilityGeneration.current;
    const isCurrentOperation = () =>
      operationGeneration === uploadOperationGeneration.current &&
      eligibilityGeneration === composerEligibilityGeneration.current &&
      activeConversationIdRef.current === activeConversationId &&
      canCommunicateRef.current;
    const selected = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      quality: 0.75,
      exif: false,
    });
    if (selected.canceled || !isCurrentOperation()) return;
    const asset = selected.assets[0];
    if (!asset) return;
    try {
      const response = await fetch(asset.uri);
      if (!response.ok) throw new Error('LOCAL_MEDIA_READ_FAILED');
      const bytes = new Uint8Array(await response.arrayBuffer());
      if (!isCurrentOperation()) return;
      const uploaded = await secureUpload({
        bytes,
        filename: asset.fileName ?? `${globalThis.crypto.randomUUID()}.jpg`,
        mimeType: asset.mimeType ?? 'image/jpeg',
        purpose: 'message_attachment',
        resourceId: activeConversationId,
        recoveryKey: `message-attachment:${activeConversationId}`,
      });
      if (!isCurrentOperation()) return;
      updateConversationState(activeConversationId, (current) => ({
        ...current,
        attachment: uploaded,
        actionFeedback: { ...current.actionFeedback, upload: '' },
      }));
    } catch {
      if (!isCurrentOperation()) return;
      updateConversationState(activeConversationId, (current) => ({
        ...current,
        actionFeedback: {
          ...current.actionFeedback,
          upload: t('messageAttachmentFailed'),
        },
      }));
    }
  }
  async function send() {
    const activeConversationId = conversationId;
    if (!activeConversationId || (!body.trim() && !attachment)) return;
    const operationGeneration = ++sendOperationGeneration.current;
    if (!effectiveCanCommunicate) {
      updateConversationState(activeConversationId, (current) => ({
        ...current,
        actionFeedback: {
          ...current.actionFeedback,
          send: t('trustCommunicationUnavailable'),
        },
      }));
      return;
    }
    const eligibilityGeneration = composerEligibilityGeneration.current;
    const isCurrentOperation = () =>
      operationGeneration === sendOperationGeneration.current &&
      eligibilityGeneration === composerEligibilityGeneration.current &&
      activeConversationIdRef.current === activeConversationId &&
      canCommunicateRef.current;
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!isCurrentOperation()) return;
    if (!user) {
      updateConversationState(activeConversationId, (current) => ({
        ...current,
        actionFeedback: {
          ...current.actionFeedback,
          send: t('signInToMessage'),
        },
      }));
      return;
    }
    const response = await supabase.rpc('send_message_with_attachments', {
      p_conversation_id: activeConversationId,
      p_body: body.trim(),
      p_upload_ids: attachment ? [attachment.uploadId] : [],
      p_client_message_id: globalThis.crypto.randomUUID(),
    });
    if (!isCurrentOperation()) return;
    const insertError = response.error;
    if (insertError) {
      updateConversationState(activeConversationId, (current) => ({
        ...current,
        actionFeedback: {
          ...current.actionFeedback,
          send: t('messageSendFailed'),
        },
      }));
    } else {
      updateConversationState(activeConversationId, (current) => ({
        ...current,
        body: '',
        attachment: null,
        actionFeedback: { ...current.actionFeedback, send: '' },
      }));
    }
  }
  function submitReport(intent: MarketplaceReportIntent) {
    return submitMarketplaceReport(trustClient, intent);
  }
  async function setBlocked(blocked: boolean): Promise<UserBlockResult> {
    const activeConversationId = conversationId;
    const actionContext = activeTrustContext;
    if (!activeConversationId || !actionContext) {
      throw new Error('TRUST_CONTEXT_REQUIRED');
    }
    const result = await setMarketplaceUserBlocked(trustClient, {
      targetUserId: actionContext.counterpartyUserId,
      blocked,
    });
    if (
      activeConversationIdRef.current === activeConversationId &&
      result.targetUserId === actionContext.counterpartyUserId
    ) {
      setLocalBlockResult({
        conversationId: activeConversationId,
        targetUserId: result.targetUserId,
        blockedByMe: result.blocked,
        canCommunicate: result.canCommunicate,
      });
    }
    return result;
  }
  const communicationNotice = effectiveBlockedByMe
    ? t('trustCommunicationBlockedByMe')
    : t('trustCommunicationUnavailable');
  return (
    <Screen>
      <Text style={styles.title}>{t('messages')}</Text>
      {!conversationId && (
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={{ gap: 10, paddingBottom: 24 }}
          keyboardShouldPersistTaps="handled"
        >
          <Card>
            <Text style={styles.lead}>{t('messagesPrivacyNotice')}</Text>
          </Card>
          {conversations.map((conversation) => (
            <Link
              key={conversation.id}
              href={{
                pathname: '/messages',
                params: { conversationId: conversation.id },
              }}
              asChild
            >
              <Button
                kind="secondary"
                label={t('conversationWithJob', {
                  id: conversation.job_id.slice(0, 8),
                })}
              />
            </Link>
          ))}
          {!conversations.length && (
            <Text style={styles.lead}>{actionFeedback.general || t('noConversations')}</Text>
          )}
        </ScrollView>
      )}
      {conversationId && (
        <>
          {trustLoading && <Text style={styles.lead}>{t('loading')}</Text>}
          {trustContextFailed && (
            <Card>
              <Text accessibilityLiveRegion="polite" style={styles.error}>
                {t('trustErrorUnknown')}
              </Text>
              <Button
                kind="secondary"
                label={t('retry')}
                onPress={() => void refreshTrustContext()}
              />
            </Card>
          )}
          {trustRefreshFailed && (
            <Card>
              <Text accessibilityLiveRegion="polite" style={styles.lead}>
                {t('trustRefreshWarning')}
              </Text>
              <Button
                kind="secondary"
                label={t('retry')}
                onPress={() => void refreshAfterMutation()}
              />
            </Card>
          )}
          {activeTrustContext && !effectiveCanCommunicate && (
            <Text accessibilityLiveRegion="polite" style={styles.lead}>
              {communicationNotice}
            </Text>
          )}
          {actionFeedback.general && (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {actionFeedback.general}
            </Text>
          )}
          {actionFeedback.send && (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {actionFeedback.send}
            </Text>
          )}
          {actionFeedback.upload && (
            <Text accessibilityLiveRegion="polite" style={styles.error}>
              {actionFeedback.upload}
            </Text>
          )}
          {snapshotError && (
            <Card>
              <Text accessibilityLiveRegion="polite" style={styles.error}>
                {snapshotError}
              </Text>
              <Button
                kind="secondary"
                label={t('retry')}
                onPress={() => retryMessageSnapshot(conversationId)}
              />
            </Card>
          )}
          {activeTrustContext && (
            <TrustControls
              blockTargetUserId={activeTrustContext.counterpartyUserId}
              blockedByMe={effectiveBlockedByMe === true}
              disabled={trustLoading}
              onCompleted={refreshAfterMutation}
              onSetBlocked={setBlocked}
              onSubmitReport={submitReport}
              target={{
                targetType: 'user',
                targetId: activeTrustContext.counterpartyUserId,
                contextConversationId: conversationId,
              }}
            />
          )}
          <FlatList
            data={messages}
            inverted
            keyExtractor={(item) => item.id}
            renderItem={({ item }) => (
              <Card>
                <Text>{item.body}</Text>
                {item.message_attachments.map((file) => (
                  <View key={file.id}>
                    {!effectiveCanCommunicate ? (
                      <Text style={styles.lead}>{communicationNotice}</Text>
                    ) : mediaGrants[file.file_upload_id] ? (
                      <Image
                        source={{ uri: mediaGrants[file.file_upload_id]?.uri }}
                        accessibilityLabel={t('messageAttachmentA11y')}
                        onError={() => invalidateMediaGrant(file.file_upload_id)}
                        style={{ width: '100%', height: 180, borderRadius: 12 }}
                      />
                    ) : (
                      <Button
                        kind="secondary"
                        label={t('loadAttachment')}
                        onPress={() => void loadSignedUrl(file.file_upload_id)}
                      />
                    )}
                  </View>
                ))}
                <Text style={styles.lead}>
                  {new Date(item.created_at).toLocaleString(locale === 'ar' ? 'ar-SA' : locale)}
                </Text>
                {activeTrustContext && item.sender_id === activeTrustContext.counterpartyUserId ? (
                  <TrustControls
                    disabled={trustLoading}
                    onSubmitReport={submitReport}
                    target={{ targetType: 'message', targetId: item.id }}
                  />
                ) : null}
              </Card>
            )}
            ListEmptyComponent={
              hasActionFeedback || snapshotError ? null : (
                <Text style={styles.lead}>{t('noMessages')}</Text>
              )
            }
          />
        </>
      )}
      {conversationId && (
        <View style={{ gap: 8 }}>
          <TextInput
            editable={effectiveCanCommunicate && !trustLoading}
            style={styles.input}
            value={body}
            onChangeText={(value) =>
              setConversationState((current) =>
                current.conversationId === conversationId
                  ? { ...current, body: value }
                  : { ...emptyConversationState(conversationId), body: value },
              )
            }
            maxLength={4000}
            placeholder={t('messagePlaceholder')}
          />
          <Button
            disabled={!conversationId || !effectiveCanCommunicate || trustLoading}
            kind="secondary"
            label={attachment ? t('attachmentReady') : t('addAttachment')}
            onPress={() => void pickAttachment()}
          />
          <Button
            disabled={!conversationId || !effectiveCanCommunicate || trustLoading}
            label={t('send')}
            onPress={() => void send()}
          />
        </View>
      )}
    </Screen>
  );
}
