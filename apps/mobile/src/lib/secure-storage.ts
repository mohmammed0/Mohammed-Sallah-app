import * as SecureStore from 'expo-secure-store';
const CHUNK_SIZE = 1800;
export const chunkedSecureStorage = {
  async getItem(key: string): Promise<string | null> {
    const countRaw = await SecureStore.getItemAsync(`${key}:count`);
    if (!countRaw) return SecureStore.getItemAsync(key);
    const count = Number(countRaw);
    if (!Number.isInteger(count) || count < 1 || count > 50) return null;
    const chunks = await Promise.all(
      Array.from({ length: count }, (_, i) => SecureStore.getItemAsync(`${key}:${i}`)),
    );
    return chunks.every((value) => value !== null) ? chunks.join('') : null;
  },
  async setItem(key: string, value: string): Promise<void> {
    await this.removeItem(key);
    const chunks = Array.from({ length: Math.ceil(value.length / CHUNK_SIZE) }, (_, i) =>
      value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE),
    );
    await Promise.all(
      chunks.map((chunk, i) =>
        SecureStore.setItemAsync(`${key}:${i}`, chunk, {
          keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
        }),
      ),
    );
    await SecureStore.setItemAsync(`${key}:count`, String(chunks.length), {
      keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK_THIS_DEVICE_ONLY,
    });
  },
  async removeItem(key: string): Promise<void> {
    const count = Number((await SecureStore.getItemAsync(`${key}:count`)) ?? 0);
    await Promise.all(
      Array.from({ length: Math.min(count, 50) }, (_, i) =>
        SecureStore.deleteItemAsync(`${key}:${i}`),
      ),
    );
    await Promise.all([
      SecureStore.deleteItemAsync(`${key}:count`),
      SecureStore.deleteItemAsync(key),
    ]);
  },
};
