import { beforeEach, describe, expect, it, vi } from 'vitest';

const secureStoreMock = vi.hoisted(() => {
  const values = new Map<string, string>();
  const state = { rejectReads: false };
  return {
    values,
    state,
    getItemAsync: vi.fn(async (key: string) => {
      if (state.rejectReads) throw new Error('native read failed');
      return values.get(key) ?? null;
    }),
    setItemAsync: vi.fn(async (key: string, value: string) => {
      values.set(key, value);
    }),
    deleteItemAsync: vi.fn(async (key: string) => {
      values.delete(key);
    }),
  };
});

vi.mock('expo-secure-store', () => ({
  AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY: 'device-only',
  getItemAsync: secureStoreMock.getItemAsync,
  setItemAsync: secureStoreMock.setItemAsync,
  deleteItemAsync: secureStoreMock.deleteItemAsync,
}));

import {
  chunkedSecureStorage,
  clearLocalAuthStorage,
  MAX_SECURE_STORE_KEY_LENGTH,
  normalizeSecureStoreKey,
  SECURE_STORE_KEY_PATTERN,
  SecureStorageError,
} from '../src/lib/secure-storage';

function allObservedKeys(): string[] {
  return [
    ...secureStoreMock.getItemAsync.mock.calls.map(([key]) => key),
    ...secureStoreMock.setItemAsync.mock.calls.map(([key]) => key),
    ...secureStoreMock.deleteItemAsync.mock.calls.map(([key]) => key),
  ];
}

describe('chunked secure storage', () => {
  beforeEach(() => {
    secureStoreMock.values.clear();
    secureStoreMock.state.rejectReads = false;
    secureStoreMock.getItemAsync.mockClear();
    secureStoreMock.setItemAsync.mockClear();
    secureStoreMock.deleteItemAsync.mockClear();
  });

  it('normalizes every key to the SecureStore alphabet and bounded length', () => {
    const normalized = normalizeSecureStoreKey('sb:project/auth token/عميل');
    expect(normalized).toMatch(SECURE_STORE_KEY_PATTERN);
    expect(`${normalized}.count`).toMatch(SECURE_STORE_KEY_PATTERN);
    expect(`${normalized}.chunk.49`).toMatch(SECURE_STORE_KEY_PATTERN);
    expect(`${normalized}.chunk.49`.length).toBeLessThanOrEqual(MAX_SECURE_STORE_KEY_LENGTH);
  });

  it('uses the original key digest to avoid sanitized-prefix collisions', () => {
    expect(normalizeSecureStoreKey('sb:project/auth')).not.toBe(
      normalizeSecureStoreKey('sb/project:auth'),
    );
  });

  it('never queries inaccessible colon-based legacy keys', async () => {
    await expect(chunkedSecureStorage.getItem('legacy:key:with:colons')).resolves.toBeNull();
    expect(allObservedKeys().every((key) => SECURE_STORE_KEY_PATTERN.test(key))).toBe(true);
  });

  it('restores a valid session stored in the corrected chunk format', async () => {
    const key = 'sb-project-auth-token';
    const value = JSON.stringify({ access_token: 'stored-session', refresh_token: 'refresh' });
    await chunkedSecureStorage.setItem(key, value);
    await expect(chunkedSecureStorage.getItem(key)).resolves.toBe(value);
  });

  it('preserves a safe unchunked legacy session key', async () => {
    const key = 'sb-project-auth-token';
    secureStoreMock.values.set(key, 'safe-direct-session');
    await expect(chunkedSecureStorage.getItem(key)).resolves.toBe('safe-direct-session');
  });

  it('cleans malformed chunk counts and terminates safely', async () => {
    const normalized = normalizeSecureStoreKey('malformed-count');
    secureStoreMock.values.set(`${normalized}.count`, 'not-a-count');
    secureStoreMock.values.set(`${normalized}.chunk.0`, 'orphan');
    await expect(chunkedSecureStorage.getItem('malformed-count')).resolves.toBeNull();
    expect(secureStoreMock.values.has(`${normalized}.count`)).toBe(false);
    expect(secureStoreMock.values.has(`${normalized}.chunk.0`)).toBe(false);
  });

  it('cleans incomplete chunks and terminates safely', async () => {
    const normalized = normalizeSecureStoreKey('incomplete-session');
    secureStoreMock.values.set(`${normalized}.count`, '2');
    secureStoreMock.values.set(`${normalized}.chunk.0`, 'first');
    await expect(chunkedSecureStorage.getItem('incomplete-session')).resolves.toBeNull();
    expect(secureStoreMock.values.has(`${normalized}.count`)).toBe(false);
    expect(secureStoreMock.values.has(`${normalized}.chunk.0`)).toBe(false);
  });

  it('classifies native read rejection without exposing a key or value', async () => {
    secureStoreMock.state.rejectReads = true;
    const error = await chunkedSecureStorage.getItem('private-session').catch((cause) => cause);
    expect(error).toBeInstanceOf(SecureStorageError);
    expect(error).toMatchObject({
      code: 'SECURE_STORAGE_UNAVAILABLE',
      operation: 'read',
      message: 'SECURE_STORAGE_UNAVAILABLE',
    });
    expect(JSON.stringify(error)).not.toContain('private-session');
  });

  it('clears only auth keys observed by the application adapter', async () => {
    secureStoreMock.values.set('unrelated.preference', 'keep-me');
    await chunkedSecureStorage.setItem('sb-project-auth-token', 'session-value');
    const cleared = await clearLocalAuthStorage();
    expect(cleared).toBeGreaterThanOrEqual(1);
    expect(secureStoreMock.values.get('unrelated.preference')).toBe('keep-me');
    expect(allObservedKeys().every((key) => SECURE_STORE_KEY_PATTERN.test(key))).toBe(true);
  });
});
