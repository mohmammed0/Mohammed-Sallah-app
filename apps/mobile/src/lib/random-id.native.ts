import { randomUUID } from 'expo-crypto';

// Hermes does not provide the browser crypto global. Use the native CSPRNG.
export function createRandomId(): string {
  return randomUUID();
}
