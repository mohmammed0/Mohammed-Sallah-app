import { beforeEach, describe, expect, it, vi } from 'vitest';

const stored = vi.hoisted(() => new Map<string, string>());
vi.mock('../src/lib/secure-storage', () => ({
  chunkedSecureStorage: {
    getItem: vi.fn(async (key: string) => stored.get(key) ?? null),
    setItem: vi.fn(async (key: string, value: string) => {
      stored.set(key, value);
    }),
    removeItem: vi.fn(async (key: string) => {
      stored.delete(key);
    }),
  },
}));

import { executeJournaledMutation } from '../src/lib/mutation-journal';

describe('persistent mutation journal', () => {
  beforeEach(() => stored.clear());

  it('reuses the original key and exact payload after a committed response is lost', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    const seen: Array<{ key: string; payload: unknown }> = [];
    await expect(
      executeJournaledMutation({
        userId,
        operation: 'publish_request',
        entityKey: 'session-1',
        payload: { title: 'Original title', version: 1 },
        execute: async (key, payload) => {
          seen.push({ key, payload });
          throw new Error('RESPONSE_LOST_AFTER_COMMIT');
        },
      }),
    ).rejects.toThrow('RESPONSE_LOST_AFTER_COMMIT');

    const result = await executeJournaledMutation({
      userId,
      operation: 'publish_request',
      entityKey: 'session-1',
      payload: { title: 'Changed after restart', version: 2 },
      execute: async (key, payload) => {
        seen.push({ key, payload });
        return { id: 'authoritative-request-id' };
      },
    });

    expect(result.id).toBe('authoritative-request-id');
    expect(seen[1]?.key).toBe(seen[0]?.key);
    expect(seen[1]?.payload).toEqual({ title: 'Original title', version: 1 });
    expect([...stored.values()].join('')).not.toContain('session-1');
  });

  it('isolates pending mutations by authenticated user', async () => {
    const keys: string[] = [];
    for (const userId of [
      '22222222-2222-4222-8222-222222222222',
      '33333333-3333-4333-8333-333333333333',
    ]) {
      await expect(
        executeJournaledMutation({
          userId,
          operation: 'select_offer',
          entityKey: 'shared-offer-id',
          payload: { userId },
          execute: async (key) => {
            keys.push(key);
            throw new Error('OFFLINE');
          },
        }),
      ).rejects.toThrow('OFFLINE');
    }
    expect(keys[0]).not.toBe(keys[1]);
    expect([...stored.keys()].some((key) => key.includes('22222222'))).toBe(true);
    expect([...stored.keys()].some((key) => key.includes('33333333'))).toBe(true);
  });
});
