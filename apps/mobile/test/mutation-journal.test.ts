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
      payload: { title: 'Original title', version: 1 },
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

  it('does not silently replace a retryable response-loss payload', async () => {
    const userId = '11111111-1111-4111-8111-111111111111';
    await expect(
      executeJournaledMutation({
        userId,
        operation: 'publish_request',
        entityKey: 'session-2',
        payload: { version: 1 },
        execute: async () => {
          throw new Error('NETWORK_TIMEOUT');
        },
      }),
    ).rejects.toThrow('NETWORK_TIMEOUT');
    await expect(
      executeJournaledMutation({
        userId,
        operation: 'publish_request',
        entityKey: 'session-2',
        payload: { version: 2 },
        execute: async () => 'not-used',
      }),
    ).rejects.toThrow('MUTATION_INTENT_STILL_PENDING');
  });

  it('allows corrected input and a new key after terminal validation or version failure', async () => {
    const userId = '44444444-4444-4444-8444-444444444444';
    const keys: string[] = [];
    await expect(
      executeJournaledMutation({
        userId,
        operation: 'submit_offer',
        entityKey: 'offer-draft',
        payload: { version: 1 },
        execute: async (key) => {
          keys.push(key);
          throw new Error('VERSION_CONFLICT');
        },
      }),
    ).rejects.toThrow('VERSION_CONFLICT');
    await expect(
      executeJournaledMutation({
        userId,
        operation: 'submit_offer',
        entityKey: 'offer-draft',
        payload: { version: 2 },
        execute: async (key) => {
          keys.push(key);
          return 'ok';
        },
      }),
    ).resolves.toBe('ok');
    expect(keys[1]).not.toBe(keys[0]);
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

  it.each([
    ['publish_request', 'request-session'],
    ['select_offer', 'offer-id'],
    ['accept_completion', 'completion-rejection'],
    ['provider_onboarding', 'onboarding-draft'],
  ] as const)(
    'serializes concurrent %s commands into one journal and authoritative result',
    async (operation, entityKey) => {
      const userId = '55555555-5555-4555-8555-555555555555';
      let release: ((value: { id: string }) => void) | undefined;
      let authoritativeCalls = 0;
      const execute = vi.fn(
        async () =>
          await new Promise<{ id: string }>((resolve) => {
            authoritativeCalls += 1;
            release = resolve;
          }),
      );
      const input = {
        userId,
        operation,
        entityKey,
        payload: { entityKey, expectedVersion: 4 },
        execute,
      };
      const first = executeJournaledMutation(input);
      const second = executeJournaledMutation(input);
      expect(second).toBe(first);
      await vi.waitFor(() => {
        const serialized = [...stored.values()].join('');
        expect(serialized.match(/"idempotencyKey"/g)).toHaveLength(1);
      });
      expect(authoritativeCalls).toBe(1);
      expect(execute.mock.calls[0]?.[0]).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
      );
      release?.({ id: `${operation}-result` });
      const [firstResult, secondResult] = await Promise.all([first, second]);
      expect(firstResult).toBe(secondResult);
      expect(firstResult).toEqual({ id: `${operation}-result` });
      expect(authoritativeCalls).toBe(1);
      expect([...stored.values()].join('')).not.toContain(entityKey);
    },
  );
});
