import { z } from 'zod';
import { chunkedSecureStorage } from '../../lib/secure-storage';
import type { ConversationMessage } from './conversation-state';
import { retainedMediaSchema } from '../../lib/durable-media';

const cleanUploadSchema = z.object({
  uploadId: z.uuid(),
  status: z.literal('clean'),
  storagePath: z.string(),
  mimeType: z.string(),
  sizeBytes: z.number().int().positive(),
  contentHash: z.string(),
});
export const pendingCustomerTurnSchema = z.object({
  clientMessageId: z.string().min(8).max(128),
  text: z.string().max(8000),
  inputKind: z.enum(['text', 'voice', 'image']),
  mediaUploadIds: z.array(z.uuid()).max(4),
  localMediaIds: z.array(z.string().min(8).max(128)).max(4),
  transcript: z.string().min(1).max(8000).nullable().default(null),
  transcriptionStatus: z.enum(['none', 'pending', 'retryable', 'completed']).default('none'),
  confirmedCategorySlug: z.string().nullable(),
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
    categoryConfirmedByUser: z.boolean(),
    categorySelectionSource: z.enum(['ai_suggestion', 'customer_correction', 'manual']).nullable(),
    cityCode: z.string(),
    urgency: z.enum(['flexible', 'normal', 'urgent', 'safety_critical']),
    schedule: z
      .enum(['asap', 'scheduled', 'today', 'flexible'])
      .transform((value) => (value === 'today' ? ('scheduled' as const) : value)),
    coordinates: z.object({ latitude: z.number(), longitude: z.number() }).nullable(),
    diagnostic: z.unknown().nullable(),
    imageUpload: cleanUploadSchema.nullable(),
    voiceUpload: cleanUploadSchema.nullable(),
    retainedMedia: z.array(retainedMediaSchema).max(4),
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

export async function replayPendingTurns<T>(
  turns: readonly PendingCustomerTurn[],
  send: (turn: PendingCustomerTurn) => Promise<T>,
): Promise<{
  completed: Array<{ turn: PendingCustomerTurn; value: T }>;
  pending: PendingCustomerTurn[];
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
    } catch {
      return { completed, pending: unique.slice(index) };
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
      mediaUploadIds: turn.mediaUploadIds,
    },
    {
      role: 'assistant',
      text: assistantText,
      clientMessageId: turn.clientMessageId,
      authoritative: true,
    },
  ];
}

export function appendTemporaryFallback(
  conversation: readonly ConversationMessage[],
  turn: PendingCustomerTurn,
  assistantText: string,
): ConversationMessage[] {
  if (conversation.some((message) => message.clientMessageId === turn.clientMessageId)) {
    return [...conversation];
  }
  return [
    ...conversation,
    {
      role: 'user',
      text: turn.text,
      clientMessageId: turn.clientMessageId,
      authoritative: false,
      mediaUploadIds: turn.mediaUploadIds,
    },
    {
      role: 'assistant',
      text: assistantText,
      clientMessageId: turn.clientMessageId,
      authoritative: false,
      temporary: true,
    },
  ];
}
