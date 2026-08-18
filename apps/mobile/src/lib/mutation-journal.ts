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
  state: z.enum(['pending', 'retryable', 'terminal_failed', 'completed', 'abandoned']),
  result: z.unknown().optional(),
  lastError: z.string().max(200).nullable().default(null),
  updatedAt: z.string(),
  createdAt: z.string(),
  expiresAt: z.string(),
});
export type MutationJournalEntry = z.infer<typeof journalEntrySchema>;

const MAX_ENTRIES = 64;
const RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
const TERMINAL_RETENTION_MS = 24 * 60 * 60 * 1000;
const inFlightMutations = new Map<
  string,
  { payloadFingerprint: string; promise: Promise<unknown> }
>();

function key(userId: string): string {
  return `sallah:mutation-journal:v2:${userId}`;
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
  return parsed.data.filter((entry) => {
    if (entry.userId !== userId || Date.parse(entry.expiresAt) <= now) return false;
    if (entry.state === 'terminal_failed' || entry.state === 'abandoned') {
      return Date.parse(entry.updatedAt) + TERMINAL_RETENTION_MS > now;
    }
    return true;
  });
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
    (entry) =>
      entry.operation === input.operation &&
      entry.entityKey === input.entityKey &&
      (entry.state === 'pending' || entry.state === 'retryable'),
  );
  if (existing) {
    if (existing.payloadFingerprint !== payloadFingerprint) {
      throw new Error('MUTATION_INTENT_STILL_PENDING');
    }
    return existing;
  }
  const now = new Date();
  const entry = journalEntrySchema.parse({
    id: globalThis.crypto.randomUUID(),
    userId: input.userId,
    operation: input.operation,
    entityKey: input.entityKey,
    payloadFingerprint,
    payload: canonicalize(input.payload),
    idempotencyKey: globalThis.crypto.randomUUID(),
    state: 'pending',
    lastError: null,
    updatedAt: now.toISOString(),
    createdAt: now.toISOString(),
    expiresAt: new Date(now.getTime() + RETENTION_MS).toISOString(),
  });
  await save(input.userId, [...entries, entry]);
  return entry;
}

async function updateMutation(
  entry: MutationJournalEntry,
  update: Partial<MutationJournalEntry>,
): Promise<MutationJournalEntry> {
  const entries = await load(entry.userId);
  const next = journalEntrySchema.parse({
    ...entry,
    ...update,
    updatedAt: new Date().toISOString(),
  });
  await save(
    entry.userId,
    entries.map((item) => (item.id === entry.id ? next : item)),
  );
  return next;
}

export async function completeMutation(
  entry: MutationJournalEntry,
  result: unknown,
): Promise<void> {
  const completed = await updateMutation(entry, { state: 'completed', result, lastError: null });
  const entries = await load(entry.userId);
  await save(
    entry.userId,
    entries.filter((item) => item.id !== completed.id),
  );
}

export async function abandonMutation(entry: MutationJournalEntry): Promise<void> {
  await updateMutation(entry, { state: 'abandoned', lastError: null });
}

function errorCode(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = error as { code?: unknown; message?: unknown };
    if (typeof candidate.code === 'string') return candidate.code;
    if (typeof candidate.message === 'string') return candidate.message;
  }
  return String(error);
}

export function mutationFailureState(error: unknown): 'retryable' | 'terminal_failed' {
  const value = errorCode(error).toUpperCase();
  if (
    /NETWORK|OFFLINE|TIMEOUT|TIMED_OUT|FETCH|CONNECTION|RESPONSE_LOST|IDEMPOTENCY_COMMAND_IN_PROGRESS/.test(
      value,
    )
  ) {
    return 'retryable';
  }
  return 'terminal_failed';
}

export function executeJournaledMutation<T>(input: {
  userId: string;
  operation: MutationOperation;
  entityKey: string;
  payload: unknown;
  execute: (idempotencyKey: string, persistedPayload: unknown) => Promise<T>;
}): Promise<T> {
  const flightKey = `${input.userId}:${input.operation}:${input.entityKey}`;
  const payloadFingerprint = mutationFingerprint(input.payload);
  const existing = inFlightMutations.get(flightKey);
  if (existing) {
    if (existing.payloadFingerprint !== payloadFingerprint) {
      return Promise.reject(new Error('MUTATION_INTENT_STILL_PENDING'));
    }
    return existing.promise as Promise<T>;
  }
  const promise = (async () => {
    const entry = await beginMutation(input);
    try {
      const result = await input.execute(entry.idempotencyKey, entry.payload);
      await completeMutation(entry, result);
      return result;
    } catch (error) {
      await updateMutation(entry, {
        state: mutationFailureState(error),
        lastError: errorCode(error).slice(0, 200),
      });
      throw error;
    }
  })();
  inFlightMutations.set(flightKey, { payloadFingerprint, promise });
  void promise.then(
    () => {
      if (inFlightMutations.get(flightKey)?.promise === promise)
        inFlightMutations.delete(flightKey);
    },
    () => {
      if (inFlightMutations.get(flightKey)?.promise === promise)
        inFlightMutations.delete(flightKey);
    },
  );
  return promise;
}
