import { randomUUID } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';

const bridge = vi.hoisted(() => ({ randomUUID: vi.fn() }));
const storage = vi.hoisted(() => new Map<string, string>());
vi.mock('expo-crypto', () => ({ randomUUID: bridge.randomUUID }));
vi.mock('../src/lib/random-id', async () => import('../src/lib/random-id.native'));
vi.mock('../src/lib/secure-storage', () => ({
  chunkedSecureStorage: {
    getItem: async (key: string) => storage.get(key) ?? null,
    setItem: async (key: string, value: string) => {
      storage.set(key, value);
    },
  },
}));
import { executeJournaledMutation } from '../src/lib/mutation-journal';

afterEach(() => {
  vi.unstubAllGlobals();
  storage.clear();
  bridge.randomUUID.mockReset();
});

describe('native mutation identifiers without browser Web Crypto', () => {
  it('persists secure native IDs and reuses them after a lost publication response', async () => {
    vi.stubGlobal('crypto', undefined);
    bridge.randomUUID.mockImplementation(randomUUID);
    const submitted: string[] = [];
    const input = {
      userId: '11111111-1111-4111-8111-111111111111',
      operation: 'publish_request' as const,
      entityKey: 'native-draft',
      payload: { title: 'Synthetic native request' },
    };
    await expect(
      executeJournaledMutation({
        ...input,
        execute: async (key) => {
          submitted.push(key);
          throw new Error('RESPONSE_LOST_AFTER_COMMIT');
        },
      }),
    ).rejects.toThrow('RESPONSE_LOST_AFTER_COMMIT');
    const result = await executeJournaledMutation({
      ...input,
      execute: async (key) => {
        submitted.push(key);
        return 'stored-request';
      },
    });
    expect(result).toBe('stored-request');
    expect(submitted).toHaveLength(2);
    expect(submitted[0]).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(submitted[1]).toBe(submitted[0]);
    expect(bridge.randomUUID).toHaveBeenCalledTimes(2);
  });

  it('does not send a command if native randomness is unavailable', async () => {
    vi.stubGlobal('crypto', undefined);
    bridge.randomUUID.mockImplementation(() => {
      throw new Error('NATIVE_RANDOM_UNAVAILABLE');
    });
    const execute = vi.fn();
    await expect(
      executeJournaledMutation({
        userId: '11111111-1111-4111-8111-111111111111',
        operation: 'publish_request',
        entityKey: 'no-random-draft',
        payload: {},
        execute,
      }),
    ).rejects.toThrow('NATIVE_RANDOM_UNAVAILABLE');
    expect(execute).not.toHaveBeenCalled();
    expect(storage.size).toBe(0);
  });
});
