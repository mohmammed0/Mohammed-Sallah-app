import { describe, expect, it } from 'vitest';
import {
  ADMIN_COMMAND_INTENT_STORAGE_PREFIX,
  adminCommandIntentStorageKey,
  consumeConfirmedCommandIntent,
} from '../src/lib/confirmed-command-intent';

class MemoryStorage {
  readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  key(index: number): string | null {
    return [...this.values.keys()][index] ?? null;
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }
}

describe('confirmed admin command intent consumption', () => {
  it('removes only fixed-namespace records whose parsed UUID exactly matches confirmation', () => {
    const storage = new MemoryStorage();
    const confirmed = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
    const matchingKey = adminCommandIntentStorageKey('marketplace-report-dismiss:report');
    const differentKey = adminCommandIntentStorageKey('marketplace-report-triage:report');
    const malformedKey = adminCommandIntentStorageKey('malformed');
    const nonCanonicalMatchKey = adminCommandIntentStorageKey('uppercase-match');
    const outsideNamespaceKey = 'untrusted:admin-command-intent';
    storage.values.set(matchingKey, JSON.stringify({ id: confirmed }));
    storage.values.set(
      differentKey,
      JSON.stringify({ id: '22222222-2222-4222-8222-222222222222' }),
    );
    storage.values.set(malformedKey, '{not-json');
    storage.values.set(nonCanonicalMatchKey, JSON.stringify({ id: confirmed.toUpperCase() }));
    storage.values.set(outsideNamespaceKey, JSON.stringify({ id: confirmed }));

    expect(consumeConfirmedCommandIntent(storage, confirmed)).toBe(1);
    expect(storage.getItem(matchingKey)).toBeNull();
    expect(storage.getItem(differentKey)).not.toBeNull();
    expect(storage.getItem(malformedKey)).toBe('{not-json');
    expect(storage.getItem(nonCanonicalMatchKey)).not.toBeNull();
    expect(storage.getItem(outsideNamespaceKey)).not.toBeNull();
    expect(matchingKey.startsWith(ADMIN_COMMAND_INTENT_STORAGE_PREFIX)).toBe(true);
    expect(consumeConfirmedCommandIntent(storage, confirmed)).toBe(0);
  });

  it('does nothing for an invalid or absent confirmation', () => {
    const storage = new MemoryStorage();
    const key = adminCommandIntentStorageKey('marketplace-report-resolve:report');
    storage.values.set(key, JSON.stringify({ id: '33333333-3333-4333-8333-333333333333' }));

    expect(consumeConfirmedCommandIntent(storage, null)).toBe(0);
    expect(consumeConfirmedCommandIntent(storage, 'not-a-uuid')).toBe(0);
    expect(storage.getItem(key)).not.toBeNull();
  });
});
