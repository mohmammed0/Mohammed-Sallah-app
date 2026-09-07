import { createRandomId } from './random-id';
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
  'marketplace_report',
  'user_block_state',
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
const journalMutationQueues = new Map<string, Promise<void>>();

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

async function loadUnlocked(userId: string): Promise<MutationJournalEntry[]> {
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

async function saveUnlocked(
  userId: string,
  entries: readonly MutationJournalEntry[],
): Promise<void> {
  await chunkedSecureStorage.setItem(key(userId), JSON.stringify(entries.slice(-MAX_ENTRIES)));
}

function withJournalMutationLock<T>(userId: string, mutate: () => Promise<T>): Promise<T> {
  const previous = journalMutationQueues.get(userId) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(mutate);
  const settled = current.then(
    () => undefined,
    () => undefined,
  );
  journalMutationQueues.set(userId, settled);
  void settled.then(() => {
    if (journalMutationQueues.get(userId) === settled) journalMutationQueues.delete(userId);
  });
  return current;
}

export async function beginMutation(input: {
  userId: string;
  operation: MutationOperation;
  entityKey: string;
  payload: unknown;
  expiresInMs?: number;
}): Promise<MutationJournalEntry> {
  return withJournalMutationLock(input.userId, async () => {
    const entries = await loadUnlocked(input.userId);
    const existing = entries.find(
      (entry) =>
        entry.operation === input.operation &&
        entry.entityKey === input.entityKey &&
        (entry.state === 'pending' || entry.state === 'retryable'),
    );
    let payload = input.payload;
    if (input.expiresInMs !== undefined) {
      const duration = z.number().int().positive().max(RETENTION_MS).parse(input.expiresInMs);
      const draft = z.record(z.string(), z.unknown()).parse(input.payload);
      if (
        !['submit_offer', 'create_change_order'].includes(input.operation) ||
        Object.hasOwn(draft, 'expiresAt')
      )
        throw new Error('INVALID_GENERATED_MUTATION_EXPIRY');
      // Generate once under the journal lock; retries still compare every persisted field.
      const expiresAt = existing
        ? z.object({ expiresAt: z.iso.datetime() }).parse(existing.payload).expiresAt
        : new Date(Date.now() + duration).toISOString();
      payload = { ...draft, expiresAt };
    }
    const payloadFingerprint = mutationFingerprint(payload);
    if (existing) {
      if (existing.payloadFingerprint !== payloadFingerprint) {
        throw new Error('MUTATION_INTENT_STILL_PENDING');
      }
      return existing;
    }
    const now = new Date();
    const entry = journalEntrySchema.parse({
      id: createRandomId(),
      userId: input.userId,
      operation: input.operation,
      entityKey: input.entityKey,
      payloadFingerprint,
      payload: canonicalize(payload),
      idempotencyKey: createRandomId(),
      state: 'pending',
      lastError: null,
      updatedAt: now.toISOString(),
      createdAt: now.toISOString(),
      expiresAt: new Date(now.getTime() + RETENTION_MS).toISOString(),
    });
    await saveUnlocked(input.userId, [...entries, entry]);
    return entry;
  });
}

async function updateMutation(
  entry: MutationJournalEntry,
  update: Partial<MutationJournalEntry>,
): Promise<MutationJournalEntry> {
  return withJournalMutationLock(entry.userId, async () => {
    const entries = await loadUnlocked(entry.userId);
    const next = journalEntrySchema.parse({
      ...entry,
      ...update,
      updatedAt: new Date().toISOString(),
    });
    await saveUnlocked(
      entry.userId,
      entries.map((item) => (item.id === entry.id ? next : item)),
    );
    return next;
  });
}

export async function completeMutation(
  entry: MutationJournalEntry,
  result: unknown,
): Promise<void> {
  await withJournalMutationLock(entry.userId, async () => {
    const entries = await loadUnlocked(entry.userId);
    const completed = journalEntrySchema.parse({
      ...entry,
      state: 'completed',
      result,
      lastError: null,
      updatedAt: new Date().toISOString(),
    });
    await saveUnlocked(
      entry.userId,
      entries
        .map((item) => (item.id === entry.id ? completed : item))
        .filter((item) => item.id !== completed.id),
    );
  });
}

export async function abandonMutation(entry: MutationJournalEntry): Promise<void> {
  await updateMutation(entry, { state: 'abandoned', lastError: null });
}

function errorSignature(error: unknown): string {
  if (error && typeof error === 'object') {
    const candidate = error as Record<string, unknown>;
    return ['code', 'message', 'details', 'hint', 'name']
      .flatMap((field) => (typeof candidate[field] === 'string' ? [candidate[field]] : []))
      .join(' ');
  }
  return String(error);
}

export function mutationFailureState(error: unknown): 'retryable' | 'terminal_failed' {
  const value = errorSignature(error).toUpperCase();
  if (
    /NETWORK|OFFLINE|TIMEOUT|TIMED_OUT|FETCH|CONNECTION|RESPONSE_LOST|IDEMPOTENCY_COMMAND_IN_PROGRESS/.test(
      value,
    )
  ) {
    return 'retryable';
  }
  return 'terminal_failed';
}

function journalErrorCode(error: unknown): string {
  const value = errorSignature(error).toUpperCase();
  const recognized = value.match(
    /RESPONSE_LOST_AFTER_COMMIT|IDEMPOTENCY_COMMAND_IN_PROGRESS|NETWORK|OFFLINE|TIMEOUT|TIMED_OUT|FETCH|CONNECTION|MUTATION_INTENT_STILL_PENDING|VERSION_CONFLICT/,
  );
  if (recognized) return recognized[0];
  return mutationFailureState(error) === 'retryable' ? 'RETRYABLE_FAILURE' : 'TERMINAL_FAILURE';
}

export function executeJournaledMutation<T>(input: {
  userId: string;
  operation: MutationOperation;
  entityKey: string;
  payload: unknown;
  expiresInMs?: number;
  execute: (idempotencyKey: string, persistedPayload: unknown) => Promise<T>;
}): Promise<T> {
  const flightKey = `${input.userId}:${input.operation}:${input.entityKey}`;
  const payloadFingerprint = mutationFingerprint(
    input.expiresInMs === undefined
      ? input.payload
      : { payload: input.payload, expiresInMs: input.expiresInMs },
  );
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
        lastError: journalErrorCode(error),
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
