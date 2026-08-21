import { z } from 'zod';

export const ADMIN_COMMAND_INTENT_STORAGE_PREFIX = 'sallah:admin-command-intent:v1:';

export function adminCommandIntentStorageKey(intentKey: string): string {
  return `${ADMIN_COMMAND_INTENT_STORAGE_PREFIX}${intentKey}`;
}

interface CommandIntentStorage {
  readonly length: number;
  key(index: number): string | null;
  getItem(key: string): string | null;
  removeItem(key: string): void;
}

const storedIntentSchema = z.object({ id: z.uuid() }).passthrough();

export function consumeConfirmedCommandIntent(
  storage: CommandIntentStorage,
  confirmedIntentId: string | null | undefined,
): number {
  const confirmed = z.uuid().safeParse(confirmedIntentId);
  if (!confirmed.success) return 0;

  let keys: (string | null)[];
  try {
    keys = Array.from({ length: storage.length }, (_, index) => storage.key(index));
  } catch {
    return 0;
  }

  let removed = 0;
  for (const key of keys) {
    if (!key?.startsWith(ADMIN_COMMAND_INTENT_STORAGE_PREFIX)) continue;
    try {
      const value = storage.getItem(key);
      if (value === null) continue;
      const parsed = storedIntentSchema.safeParse(JSON.parse(value) as unknown);
      if (!parsed.success || parsed.data.id !== confirmed.data) continue;
      storage.removeItem(key);
      removed += 1;
    } catch {
      // A malformed or inaccessible record is unrelated to a confirmed command.
    }
  }
  return removed;
}
