// Web and Node use their secure-context Web Crypto implementation.
// Metro selects random-id.native.ts for Android and iOS.
export function createRandomId(): string {
  return globalThis.crypto.randomUUID();
}
