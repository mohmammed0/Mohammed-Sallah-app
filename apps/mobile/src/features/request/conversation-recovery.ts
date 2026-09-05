import { z } from 'zod';
import { chunkedSecureStorage } from '../../lib/secure-storage';
import type { ConversationMessage } from './conversation-state';
import { retainedMediaSchema } from '../../lib/durable-media';

export const cleanUploadSchema = z
  .object({
    uploadId: z.uuid(),
    status: z.literal('clean'),
    sanitized: z.literal(true).default(true),
    mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp', 'audio/mp4', 'video/mp4']),
    sizeBytes: z
      .number()
      .int()
      .positive()
      .max(20 * 1024 * 1024),
    // Accept these only while migrating old on-device snapshots. The transform
    // strips both private fields so V2 callers cannot re-persist or submit them.
    storagePath: z.string().optional(),
    contentHash: z.string().optional(),
  })
  .transform((value) => ({
    uploadId: value.uploadId,
    status: value.status,
    sanitized: value.sanitized,
    mimeType: value.mimeType,
    sizeBytes: value.sizeBytes,
  }));
export type RecoveredCleanUpload = z.infer<typeof cleanUploadSchema>;
export const turnMediaBindingSchema = z.object({
  localMediaId: z.string().min(8).max(128),
  kind: z.enum(['image', 'voice']),
  upload: cleanUploadSchema.nullable(),
});
export type TurnMediaBinding = z.infer<typeof turnMediaBindingSchema>;
export const pendingCustomerTurnSchema = z.object({
  clientMessageId: z.string().min(8).max(128),
  text: z.string().max(8000),
  inputKind: z.enum(['text', 'voice', 'image']),
  mediaUploadIds: z.array(z.uuid()).max(4),
  localMediaIds: z.array(z.string().min(8).max(128)).max(4),
  mediaBindings: z.array(turnMediaBindingSchema).max(4).default([]),
  transcript: z.string().max(8000).nullable().default(null),
  transcriptionStatus: z
    .enum(['none', 'pending', 'review', 'retryable', 'completed'])
    .default('none'),
  confirmedCategorySlug: z.string().nullable(),
  confirmedSubcategorySlug: z.string().nullable().default(null),
  summaryRequested: z.boolean(),
  createdAt: z.string(),
});
export type PendingCustomerTurn = z.infer<typeof pendingCustomerTurnSchema>;

const conversationMessageSchema = z.object({
  role: z.enum(['user', 'assistant']),
  text: z.string(),
  clientMessageId: z.string().optional(),
  authoritative: z.boolean().optional(),
  temporary: z.boolean().optional(),
  mediaUploadIds: z.array(z.uuid()).optional(),
  delivery: z.enum(['pending', 'retryable', 'offline', 'sent']).optional(),
  inputKind: z.enum(['text', 'voice', 'image']).optional(),
  transcriptStatus: z.enum(['pending', 'review', 'retryable', 'completed']).optional(),
});

export const aiIntakeSnapshotSchema = z.object({
  version: z.literal(2),
  sessionId: z.uuid().nullable(),
  conversation: z.array(conversationMessageSchema),
  pendingTurns: z.array(pendingCustomerTurnSchema),
  draft: z.object({
    description: z.string(),
    title: z.string(),
    summary: z.string(),
    suggestedCategorySlug: z
      .string()
      .nullable()
      .transform((value) => value ?? ''),
    selectedCategorySlug: z.string(),
    selectedSubcategorySlug: z.string().default(''),
    categoryConfirmedByUser: z.boolean(),
    categorySelectionSource: z.enum(['ai_suggestion', 'customer_correction', 'manual']).nullable(),
    cityCode: z.string(),
    urgency: z.enum(['flexible', 'normal', 'urgent', 'safety_critical']),
    schedule: z
      .enum(['asap', 'scheduled', 'today', 'flexible'])
      .transform((value) => (value === 'today' ? ('scheduled' as const) : value)),
    coordinates: z.object({ latitude: z.number(), longitude: z.number() }).nullable(),
    selectedAddressId: z.uuid().nullable().default(null),
    formattedAddress: z.string().max(500).default(''),
    addressLabel: z.string().max(80).default(''),
    building: z.string().max(80).default(''),
    unit: z.string().max(80).default(''),
    accessNotes: z.string().max(500).default(''),
    requestedStart: z.string().datetime().nullable().default(null),
    requestedEnd: z.string().datetime().nullable().default(null),
    journeyStep: z
      .enum(['category', 'chat', 'location', 'timing', 'review', 'success'])
      .default('category'),
    diagnostic: z.unknown().nullable(),
    imageUpload: cleanUploadSchema.nullable(),
    voiceUpload: cleanUploadSchema.nullable(),
    retainedMedia: z.array(retainedMediaSchema).max(4),
    activeImageMediaId: z.string().min(8).max(128).nullable().default(null),
    activeVoiceMediaId: z.string().min(8).max(128).nullable().default(null),
    requestMediaUploadIds: z.array(z.uuid()).max(8).default([]),
    activeLocation: z
      .object({
        savedAddressId: z.uuid().nullable(),
        label: z.string().max(80),
        formattedAddress: z.string().max(500),
        building: z.string().max(80).nullable(),
        unit: z.string().max(80).nullable(),
        accessNotes: z.string().max(500).nullable(),
        cityCode: z.string().min(2).max(80),
        cityNameAr: z.string(),
        cityNameEn: z.string(),
        coordinates: z.object({
          latitude: z.number().finite().min(-90).max(90),
          longitude: z.number().finite().min(-180).max(180),
        }),
      })
      .nullable()
      .optional(),
  }),
});
export type AiIntakeSnapshot = z.infer<typeof aiIntakeSnapshotSchema>;

function storageKey(userId: string): string {
  return `sallah:ai-intake:v3:${userId}`;
}

export async function loadAiIntakeSnapshot(userId: string): Promise<AiIntakeSnapshot | null> {
  const raw = await chunkedSecureStorage.getItem(storageKey(userId));
  if (!raw) return null;
  const parsed = aiIntakeSnapshotSchema.safeParse(JSON.parse(raw));
  return parsed.success ? parsed.data : null;
}

export async function saveAiIntakeSnapshot(
  userId: string,
  snapshot: AiIntakeSnapshot,
): Promise<void> {
  await chunkedSecureStorage.setItem(storageKey(userId), JSON.stringify(snapshot));
}

export async function clearAiIntakeSnapshot(userId: string): Promise<void> {
  await chunkedSecureStorage.removeItem(storageKey(userId));
}

function abandonmentKey(userId: string): string {
  return `sallah:ai-intake-abandonment:v1:${userId}`;
}

export async function queueAiIntakeAbandonment(userId: string, sessionId: string): Promise<void> {
  await chunkedSecureStorage.setItem(abandonmentKey(userId), sessionId);
}

export async function takeAiIntakeAbandonment(userId: string): Promise<string | null> {
  return chunkedSecureStorage.getItem(abandonmentKey(userId));
}

export async function clearAiIntakeAbandonment(userId: string): Promise<void> {
  await chunkedSecureStorage.removeItem(abandonmentKey(userId));
}

export function enqueuePendingTurn(
  turns: readonly PendingCustomerTurn[],
  turn: PendingCustomerTurn,
): PendingCustomerTurn[] {
  if (turns.some((item) => item.clientMessageId === turn.clientMessageId)) return [...turns];
  return [...turns, pendingCustomerTurnSchema.parse(turn)].sort((left, right) =>
    left.createdAt.localeCompare(right.createdAt),
  );
}

export function retryFailedTranscriptionTurns(
  turns: readonly PendingCustomerTurn[],
): PendingCustomerTurn[] {
  return turns.map((turn) =>
    turn.transcriptionStatus === 'retryable' ? { ...turn, transcriptionStatus: 'pending' } : turn,
  );
}

function assertVoiceTurn(turn: PendingCustomerTurn): void {
  if (turn.inputKind !== 'voice') throw new Error('TRANSCRIPT_REVIEW_INVALID');
}

function boundedTranscript(value: string, allowBlank: boolean): string {
  if (value.length > 8000 || (!allowBlank && value.trim().length === 0)) {
    throw new Error('TRANSCRIPT_REVIEW_INVALID');
  }
  return allowBlank ? value : value.trim();
}

export function stageTranscriptReview(
  turn: PendingCustomerTurn,
  transcript: string,
): PendingCustomerTurn {
  assertVoiceTurn(turn);
  const reviewed = boundedTranscript(transcript, false);
  return pendingCustomerTurnSchema.parse({
    ...turn,
    text: reviewed,
    transcript: reviewed,
    transcriptionStatus: 'review',
  });
}

export function updateTranscriptReview(
  turn: PendingCustomerTurn,
  transcript: string,
): PendingCustomerTurn {
  assertVoiceTurn(turn);
  if (turn.transcriptionStatus !== 'review') throw new Error('TRANSCRIPT_REVIEW_INVALID');
  const reviewed = boundedTranscript(transcript, true);
  return pendingCustomerTurnSchema.parse({ ...turn, text: reviewed, transcript: reviewed });
}

export function confirmTranscriptReview(turn: PendingCustomerTurn): PendingCustomerTurn {
  assertVoiceTurn(turn);
  if (turn.transcriptionStatus !== 'review' || turn.transcript === null) {
    throw new Error('TRANSCRIPT_REVIEW_INVALID');
  }
  const reviewed = boundedTranscript(turn.transcript, false);
  return pendingCustomerTurnSchema.parse({
    ...turn,
    text: reviewed,
    transcript: reviewed,
    transcriptionStatus: 'completed',
  });
}

export class TranscriptReviewRequiredError extends Error {
  constructor() {
    super('TRANSCRIPT_REVIEW_REQUIRED');
    this.name = 'TranscriptReviewRequiredError';
  }
}

export function isTranscriptReviewRequiredError(error: unknown): boolean {
  return error instanceof TranscriptReviewRequiredError;
}

export async function replayPendingTurns<T>(
  turns: readonly PendingCustomerTurn[],
  send: (turn: PendingCustomerTurn) => Promise<T>,
): Promise<{
  completed: Array<{ turn: PendingCustomerTurn; value: T }>;
  pending: PendingCustomerTurn[];
  error?: unknown;
}> {
  const unique = turns.filter(
    (turn, index) =>
      turns.findIndex((item) => item.clientMessageId === turn.clientMessageId) === index,
  );
  const completed: Array<{ turn: PendingCustomerTurn; value: T }> = [];
  for (let index = 0; index < unique.length; index += 1) {
    const turn = unique[index];
    if (!turn) continue;
    try {
      completed.push({ turn, value: await send(turn) });
    } catch (error) {
      return { completed, pending: unique.slice(index), error };
    }
  }
  return { completed, pending: [] };
}

export function reconcileAuthoritativeTurn(
  conversation: readonly ConversationMessage[],
  turn: PendingCustomerTurn,
  assistantText: string,
): ConversationMessage[] {
  const retained = conversation.filter(
    (message) => message.clientMessageId !== turn.clientMessageId,
  );
  return [
    ...retained,
    {
      role: 'user',
      text: turn.text,
      clientMessageId: turn.clientMessageId,
      authoritative: true,
      delivery: 'sent',
      mediaUploadIds: turn.mediaUploadIds,
      inputKind: turn.inputKind,
      transcriptStatus: turn.inputKind === 'voice' ? 'completed' : undefined,
    },
    {
      role: 'assistant',
      text: assistantText,
      clientMessageId: turn.clientMessageId,
      authoritative: true,
      delivery: 'sent',
    },
  ];
}

export function appendTemporaryFallback(
  conversation: readonly ConversationMessage[],
  turn: PendingCustomerTurn,
  assistantText: string,
): ConversationMessage[] {
  const retained = conversation.filter(
    (message) => message.clientMessageId !== turn.clientMessageId,
  );
  return [
    ...retained,
    {
      role: 'user',
      text: turn.text,
      clientMessageId: turn.clientMessageId,
      authoritative: false,
      delivery: 'offline',
      mediaUploadIds: turn.mediaUploadIds,
      inputKind: turn.inputKind,
      transcriptStatus:
        turn.inputKind === 'voice'
          ? turn.transcriptionStatus === 'review'
            ? 'review'
            : turn.transcriptionStatus === 'retryable'
              ? 'retryable'
              : 'pending'
          : undefined,
    },
    {
      role: 'assistant',
      text: assistantText,
      clientMessageId: turn.clientMessageId,
      authoritative: false,
      temporary: true,
      delivery: 'offline',
    },
  ];
}
