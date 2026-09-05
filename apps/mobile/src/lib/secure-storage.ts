import { sha256 } from '@noble/hashes/sha2.js';
import { bytesToHex, utf8ToBytes } from '@noble/hashes/utils.js';
import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1800;
const MAX_CHUNKS = 50;
const KEY_NAMESPACE = 'sallah.auth.v2';
const KEY_PREFIX_LENGTH = 24;

export const MAX_SECURE_STORE_KEY_LENGTH = 128;
export const SECURE_STORE_KEY_PATTERN = /^[A-Za-z0-9._-]+$/;

type SecureStorageOperation = 'read' | 'write' | 'delete' | 'key';

export class SecureStorageError extends Error {
  readonly code = 'SECURE_STORAGE_UNAVAILABLE';

  constructor(readonly operation: SecureStorageOperation) {
    super('SECURE_STORAGE_UNAVAILABLE');
    this.name = 'SecureStorageError';
  }
}

export function isSecureStorageError(error: unknown): error is SecureStorageError {
  return error instanceof SecureStorageError;
}

const knownAuthStorageKeys = new Set<string>();

function assertSecureStoreKey(key: string): void {
  if (
    key.length === 0 ||
    key.length > MAX_SECURE_STORE_KEY_LENGTH ||
    !SECURE_STORE_KEY_PATTERN.test(key)
  ) {
    throw new SecureStorageError('key');
  }
}

function sanitizedPrefix(key: string): string {
  const prefix = key
    .normalize('NFKC')
    .replace(/[^A-Za-z0-9._-]+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, KEY_PREFIX_LENGTH);
  return prefix || 'key';
}

export function normalizeSecureStoreKey(key: string): string {
  const digest = bytesToHex(sha256(utf8ToBytes(key)));
  const normalized = `${KEY_NAMESPACE}.${sanitizedPrefix(key)}.${digest}`;
  assertSecureStoreKey(`${normalized}.chunk.${MAX_CHUNKS - 1}`);
  return normalized;
}

function countKey(normalizedKey: string): string {
  return `${normalizedKey}.count`;
}

function chunkKey(normalizedKey: string, index: number): string {
  return `${normalizedKey}.chunk.${index}`;
}

function canUseLegacyDirectKey(key: string): boolean {
  return (
    key.length > 0 &&
    key.length <= MAX_SECURE_STORE_KEY_LENGTH &&
    SECURE_STORE_KEY_PATTERN.test(key)
  );
}

function asStorageError(error: unknown, operation: SecureStorageOperation): SecureStorageError {
  return isSecureStorageError(error) ? error : new SecureStorageError(operation);
}

async function readSecureValue(key: string): Promise<string | null> {
  assertSecureStoreKey(key);
  try {
    return await SecureStore.getItemAsync(key);
  } catch (error) {
    throw asStorageError(error, 'read');
  }
}

async function writeSecureValue(key: string, value: string): Promise<void> {
  assertSecureStoreKey(key);
  try {
    await SecureStore.setItemAsync(key, value, {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  } catch (error) {
    throw asStorageError(error, 'write');
  }
}

async function deleteSecureValue(key: string): Promise<void> {
  assertSecureStoreKey(key);
  try {
    await SecureStore.deleteItemAsync(key);
  } catch (error) {
    throw asStorageError(error, 'delete');
  }
}

async function clearNormalizedValue(normalizedKey: string): Promise<void> {
  await Promise.all([
    deleteSecureValue(countKey(normalizedKey)),
    ...Array.from({ length: MAX_CHUNKS }, (_, index) =>
      deleteSecureValue(chunkKey(normalizedKey, index)),
    ),
  ]);
}

async function removeStorageValue(key: string): Promise<void> {
  const normalizedKey = normalizeSecureStoreKey(key);
  await clearNormalizedValue(normalizedKey);
  if (canUseLegacyDirectKey(key)) await deleteSecureValue(key);
}

export async function clearLocalAuthStorage(): Promise<number> {
  const keys = [...knownAuthStorageKeys];
  await Promise.all(keys.map((key) => removeStorageValue(key)));
  keys.forEach((key) => knownAuthStorageKeys.delete(key));
  return keys.length;
}

export const chunkedSecureStorage = {
  async getItem(key: string): Promise<string | null> {
    knownAuthStorageKeys.add(key);
    const normalizedKey = normalizeSecureStoreKey(key);
    const countRaw = await readSecureValue(countKey(normalizedKey));

    if (countRaw === null) {
      return canUseLegacyDirectKey(key) ? readSecureValue(key) : null;
    }

    const count = Number(countRaw);
    if (!Number.isInteger(count) || count < 1 || count > MAX_CHUNKS) {
      await clearNormalizedValue(normalizedKey);
      return null;
    }

    const chunks = await Promise.all(
      Array.from({ length: count }, (_, index) => readSecureValue(chunkKey(normalizedKey, index))),
    );
    if (chunks.some((value) => value === null)) {
      await clearNormalizedValue(normalizedKey);
      return null;
    }
    return chunks.join('');
  },

  async setItem(key: string, value: string): Promise<void> {
    knownAuthStorageKeys.add(key);
    const normalizedKey = normalizeSecureStoreKey(key);
    const chunkCount = Math.max(1, Math.ceil(value.length / CHUNK_SIZE));
    if (chunkCount > MAX_CHUNKS) throw new SecureStorageError('write');

    const chunks = Array.from({ length: chunkCount }, (_, index) =>
      value.slice(index * CHUNK_SIZE, (index + 1) * CHUNK_SIZE),
    );

    await clearNormalizedValue(normalizedKey);
    if (canUseLegacyDirectKey(key)) await deleteSecureValue(key);

    try {
      await Promise.all(
        chunks.map((chunk, index) => writeSecureValue(chunkKey(normalizedKey, index), chunk)),
      );
      await writeSecureValue(countKey(normalizedKey), String(chunks.length));
    } catch (error) {
      try {
        await clearNormalizedValue(normalizedKey);
      } catch {
        // Keep the original privacy-safe storage failure.
      }
      throw asStorageError(error, 'write');
    }
  },

  async removeItem(key: string): Promise<void> {
    knownAuthStorageKeys.add(key);
    await removeStorageValue(key);
    knownAuthStorageKeys.delete(key);
  },
};
