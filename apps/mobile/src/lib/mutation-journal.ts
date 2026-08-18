import { z } from 'zod';
import { chunkedSecureStorage } from './secure-storage';

export const mutationOperationSchema = z.enum([
  'publish_request',
  'select_offer',
  'provider_onboarding',
  'submit_offer',
  'transition_job',
  'create_change_order',
  'decide_change_order',
  'submit_completion',
  'accept_completion',
  'request_cancellation',
  'decide_cancellation',
  'open_dispute',
  'resolve_dispute',
  'support_case',
  'financial_admin',
]);
export type MutationOperation = z.infer<typeof mutationOperationSchema>;

const journalEntrySchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  operation: mutationOperationSchema,
  entityKey: z.string().min(1).max(256),
  payloadFingerprint: z.string().min(1),
  payload: z.unknown(),
  idempotencyKey: z.uuid(),
  createdAt: z.string(),
  expiresAt: z.string(),
});
export type MutationJournalEntry = z.infer<typeof journalEntrySchema>;

const MAX_ENTRIES = 64;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;

function key(userId: string): string {
  return `sallah:mutation-journal:v1:${userId}`;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([name, item]) => [name, canonicalize(item)]),
    );
  }
  return value;
}

export function mutationFingerprint(payload: unknown): string {
  return JSON.stringify(canonicalize(payload));
}

async function load(userId: string): Promise<MutationJournalEntry[]> {
  const raw = await chunkedSecureStorage.getItem(key(userId));
  if (!raw) return [];
  const parsed = z.array(journalEntrySchema).safeParse(JSON.parse(raw));
  if (!parsed.success) return [];
  const now = Date.now();
  return parsed.data.filter(
    (entry) => entry.userId === userId && Date.parse(entry.expiresAt) > now,
  );
}

async function save(userId: string, entries: readonly MutationJournalEntry[]): Promise<void> {
  await chunkedSecureStorage.setItem(key(userId), JSON.stringify(entries.slice(-MAX_ENTRIES)));
}

export async function beginMutation(input: {
  userId: string;
  operation: MutationOperation;
  entityKey: string;
  payload: unknown;
}): Promise<MutationJournalEntry> {
  const entries = await load(input.userId);
  const payloadFingerprint = mutationFingerprint(input.payload);
  const existing = entries.find(
    (entry) => entry.operation === input.operation && entry.entityKey === input.entityKey,
  );
  if (existing) return existing;
  const now = new Date();
  const entry = journalEntrySchema.parse({
    id: globalThis.crypto.randomUUID(),
    userId: input.userId,
    operation: input.operation,
    entityKey: input.entityKey,
    payloadFingerprint,
    payload: canonicalize(input.payload),
    idempotencyKey: globalThis.crypto.randomUUID(),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + RETENTION_MS).toISOString(),
  });
  await save(input.userId, [...entries, entry]);
  return entry;
}

export async function completeMutation(entry: MutationJournalEntry): Promise<void> {
  const entries = await load(entry.userId);
  await save(
    entry.userId,
    entries.filter((item) => item.id !== entry.id),
  );
}

export async function executeJournaledMutation<T>(input: {
  userId: string;
  operation: MutationOperation;
  entityKey: string;
  payload: unknown;
  execute: (idempotencyKey: string, persistedPayload: unknown) => Promise<T>;
}): Promise<T> {
  const entry = await beginMutation(input);
  const result = await input.execute(entry.idempotencyKey, entry.payload);
  await completeMutation(entry);
  return result;
}
