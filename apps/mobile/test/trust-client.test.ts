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

import {
  loadMarketplaceTrustContext,
  setMarketplaceUserBlocked,
  submitMarketplaceReport,
  TrustClientError,
  type TrustRpcClient,
} from '../src/features/trust/trust-client';

const userId = '11111111-1111-4111-8111-111111111111';
const targetUserId = '22222222-2222-4222-8222-222222222222';
const conversationId = '33333333-3333-4333-8333-333333333333';
const targetId = '44444444-4444-4444-8444-444444444444';
const reportId = '55555555-5555-4555-8555-555555555555';

function clientWith(
  rpc: (name: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: unknown }>,
  authenticatedUserId: string | null = userId,
): TrustRpcClient {
  return {
    getUser: vi.fn(async () => ({
      data: { user: authenticatedUserId ? { id: authenticatedUserId } : null },
      error: null,
    })),
    createMarketplaceReportV2: (args) => rpc('create_marketplace_report_v2', args),
    getMarketplaceTrustContext: (args) => rpc('get_marketplace_trust_context', args),
    setUserBlock: (args) => rpc('set_user_block', args),
  };
}

describe('marketplace trust client', () => {
  beforeEach(() => stored.clear());

  it('loads only a strict server-derived conversation trust context after local auth', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        conversationId,
        counterpartyUserId: targetUserId,
        blockedByMe: false,
        canCommunicate: true,
        restriction: null,
      },
      error: null,
    }));
    const client = clientWith(rpc);

    await expect(loadMarketplaceTrustContext(client, conversationId)).resolves.toMatchObject({
      conversationId,
      counterpartyUserId: targetUserId,
      canCommunicate: true,
    });
    expect(rpc).toHaveBeenCalledWith('get_marketplace_trust_context', {
      p_conversation_id: conversationId,
    });
  });

  it('retries a report with the exact persisted payload and original idempotency key', async () => {
    const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      rpcCalls.push({ name, args });
      if (rpcCalls.length === 1) {
        return { data: null, error: { message: 'RESPONSE_LOST_AFTER_COMMIT' } };
      }
      return {
        data: {
          reportId,
          status: 'submitted',
          createdAt: '2026-08-20T12:00:00.000Z',
          deduplicated: true,
        },
        error: null,
      };
    });
    const client = clientWith(rpc);
    const intent = {
      targetType: 'message' as const,
      targetId,
      reasonCategory: 'harassment' as const,
      explanation: '  Original details  ',
    };

    await expect(submitMarketplaceReport(client, intent)).rejects.toMatchObject({
      category: 'network',
    });
    await expect(submitMarketplaceReport(client, intent)).resolves.toMatchObject({ reportId });

    expect(rpcCalls.map((call) => call.name)).toEqual([
      'create_marketplace_report_v2',
      'create_marketplace_report_v2',
    ]);
    expect(rpcCalls[0]?.args).toEqual({
      p_target_type: 'message',
      p_target_id: targetId,
      p_context_conversation_id: null,
      p_reason_category: 'harassment',
      p_explanation: 'Original details',
      p_idempotency_key: expect.any(String),
    });
    expect(rpcCalls[1]?.args).toEqual(rpcCalls[0]?.args);
  });

  it.each([
    [
      'user',
      {
        targetType: 'user',
        targetId,
        contextConversationId: conversationId,
        reasonCategory: 'harassment',
        explanation: '',
      },
      conversationId,
    ],
    [
      'message',
      { targetType: 'message', targetId, reasonCategory: 'safety', explanation: '' },
      null,
    ],
    [
      'rating',
      { targetType: 'rating', targetId, reasonCategory: 'rating_abuse', explanation: '' },
      null,
    ],
  ] as const)(
    'uses report v2 with conditional context and accepts PostgreSQL time for %s',
    async (_targetType, intent, expectedContext) => {
      const rpc = vi.fn(async () => ({
        data: {
          reportId,
          status: 'submitted',
          createdAt: '2026-08-20T12:00:00.123456+00:00',
          deduplicated: false,
        },
        error: null,
      }));
      const client = clientWith(rpc);
      await expect(submitMarketplaceReport(client, intent)).resolves.toMatchObject({
        reportId,
        createdAt: '2026-08-20T12:00:00.123456+00:00',
      });
      expect(rpc).toHaveBeenCalledWith(
        'create_marketplace_report_v2',
        expect.objectContaining({ p_context_conversation_id: expectedContext }),
      );
    },
  );

  it('preserves the report key and payload while an idempotent command is in progress', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const client = clientWith(
      vi.fn(async (_name, args) => {
        calls.push(args);
        if (calls.length === 1) {
          return {
            data: null,
            error: {
              code: 'P0001',
              details: 'private command row 814',
              hint: null,
              message: 'IDEMPOTENCY_COMMAND_IN_PROGRESS',
            },
          };
        }
        return {
          data: {
            reportId,
            status: 'submitted',
            createdAt: '2026-08-20T12:00:00+00:00',
            deduplicated: true,
          },
          error: null,
        };
      }),
    );
    const intent = {
      targetType: 'user' as const,
      targetId: targetUserId,
      contextConversationId: conversationId,
      reasonCategory: 'spam' as const,
      explanation: 'Exact retry details',
    };
    let caught: unknown;
    try {
      await submitMarketplaceReport(client, intent);
    } catch (error) {
      caught = error;
    }
    expect(caught).toMatchObject({
      category: 'conflict',
      code: 'IDEMPOTENCY_COMMAND_IN_PROGRESS',
    });
    expect(String(caught)).not.toContain('IDEMPOTENCY_COMMAND_IN_PROGRESS');
    expect(String(caught)).not.toContain('private command row 814');
    await expect(submitMarketplaceReport(client, intent)).resolves.toMatchObject({ reportId });
    expect(calls[1]).toEqual(calls[0]);
    expect(calls[0]).toMatchObject({
      p_context_conversation_id: conversationId,
      p_target_type: 'user',
    });
  });

  it('keeps user reports for the same target in different conversations as distinct journals', async () => {
    const secondConversationId = '66666666-6666-4666-8666-666666666666';
    const attempts = new Map<string, number>();
    const calls: Array<Record<string, unknown>> = [];
    const client = clientWith(
      vi.fn(async (_name, args) => {
        calls.push(args);
        const context = String(args.p_context_conversation_id);
        const attempt = (attempts.get(context) ?? 0) + 1;
        attempts.set(context, attempt);
        if (attempt === 1) {
          return { data: null, error: { message: 'RESPONSE_LOST_AFTER_COMMIT' } };
        }
        return {
          data: {
            reportId,
            status: 'submitted',
            createdAt: '2026-08-20T12:00:00+00:00',
            deduplicated: true,
          },
          error: null,
        };
      }),
    );
    const intentFor = (contextConversationId: string) => ({
      targetType: 'user' as const,
      targetId: targetUserId,
      contextConversationId,
      reasonCategory: 'safety' as const,
      explanation: 'Exact relationship context',
    });

    await expect(submitMarketplaceReport(client, intentFor(conversationId))).rejects.toMatchObject({
      category: 'network',
    });
    await expect(
      submitMarketplaceReport(client, intentFor(secondConversationId)),
    ).rejects.toMatchObject({ category: 'network' });
    const pending = JSON.parse([...stored.values()].join('')) as Array<{
      entityKey: string;
      payload: { contextConversationId?: string };
    }>;
    expect(pending).toHaveLength(2);
    expect(new Set(pending.map((entry) => entry.entityKey)).size).toBe(2);
    expect(pending.map((entry) => entry.payload.contextConversationId).sort()).toEqual(
      [conversationId, secondConversationId].sort(),
    );

    await expect(submitMarketplaceReport(client, intentFor(conversationId))).resolves.toMatchObject(
      { reportId },
    );
    await expect(
      submitMarketplaceReport(client, intentFor(secondConversationId)),
    ).resolves.toMatchObject({ reportId });
    expect(calls[2]).toEqual(calls[0]);
    expect(calls[3]).toEqual(calls[1]);
    expect(calls[0]?.p_idempotency_key).not.toBe(calls[1]?.p_idempotency_key);
  });

  it('sends explicit block and unblock desired states without a toggle command', async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const rpc = vi.fn(async (name: string, args: Record<string, unknown>) => {
      calls.push({ name, args });
      const blocked = args.p_blocked === true;
      return {
        data: {
          targetUserId,
          blocked,
          changed: true,
          canCommunicate: !blocked,
        },
        error: null,
      };
    });
    const client = clientWith(rpc);

    await setMarketplaceUserBlocked(client, { targetUserId, blocked: true });
    await setMarketplaceUserBlocked(client, { targetUserId, blocked: false });

    expect(calls.map((call) => call.name)).toEqual(['set_user_block', 'set_user_block']);
    expect(calls[0]?.args).toMatchObject({
      p_target_user_id: targetUserId,
      p_blocked: true,
      p_reason: 'user_requested_block',
    });
    expect(calls[1]?.args).toMatchObject({
      p_target_user_id: targetUserId,
      p_blocked: false,
      p_reason: 'user_requested_unblock',
    });
    expect(calls[1]?.args.p_idempotency_key).not.toBe(calls[0]?.args.p_idempotency_key);
  });

  it('retries a block command with the exact persisted payload and original idempotency key', async () => {
    const calls: Array<Record<string, unknown>> = [];
    const client = clientWith(
      vi.fn(async (_name, args) => {
        calls.push(args);
        if (calls.length === 1) {
          return { data: null, error: { message: 'RESPONSE_LOST_AFTER_COMMIT' } };
        }
        return {
          data: {
            targetUserId,
            blocked: true,
            changed: false,
            canCommunicate: false,
          },
          error: null,
        };
      }),
    );

    await expect(
      setMarketplaceUserBlocked(client, { targetUserId, blocked: true }),
    ).rejects.toMatchObject({ category: 'network' });
    await expect(
      setMarketplaceUserBlocked(client, { targetUserId, blocked: true }),
    ).resolves.toEqual({
      targetUserId,
      blocked: true,
      changed: false,
      canCommunicate: false,
    });
    expect(calls[1]).toEqual(calls[0]);
    expect(calls[0]).toEqual({
      p_target_user_id: targetUserId,
      p_blocked: true,
      p_reason: 'user_requested_block',
      p_idempotency_key: expect.any(String),
    });
  });

  it('fails locally when there is no authenticated user and never calls the RPC', async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    await expect(
      submitMarketplaceReport(clientWith(rpc, null), {
        targetType: 'user',
        targetId,
        contextConversationId: conversationId,
        reasonCategory: 'spam',
        explanation: '',
      }),
    ).rejects.toEqual(expect.objectContaining({ category: 'auth' }));
    expect(rpc).not.toHaveBeenCalled();
  });

  it('maps server details to deterministic safe UI categories without retaining raw errors', async () => {
    const invalidResponseClient = clientWith(
      vi.fn(async () => ({
        data: {
          conversationId,
          counterpartyUserId: targetUserId,
          blockedByMe: false,
          canCommunicate: true,
          restriction: null,
          internalAuditMetadata: 'do-not-expose',
        },
        error: null,
      })),
    );
    await expect(
      loadMarketplaceTrustContext(invalidResponseClient, conversationId),
    ).rejects.toMatchObject({ category: 'invalid_response' });

    const rateLimitedRpc = vi.fn(async () => ({
      data: null,
      error: {
        code: 'P0001',
        details: 'private actor bucket 42',
        hint: null,
        message: 'RATE_LIMITED',
      },
    }));
    const rateLimitedClient = clientWith(rateLimitedRpc);
    let caught: unknown;
    try {
      await submitMarketplaceReport(rateLimitedClient, {
        targetType: 'message',
        targetId,
        reasonCategory: 'spam',
        explanation: '',
      });
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(TrustClientError);
    expect(caught).toMatchObject({ category: 'rate_limited' });
    expect(String(caught)).not.toContain('private actor bucket 42');
    expect(rateLimitedRpc).toHaveBeenCalledWith(
      'create_marketplace_report_v2',
      expect.objectContaining({ p_context_conversation_id: null }),
    );
  });

  it('rejects legacy block disclosure fields and missing generic communication state', async () => {
    const legacyContextClient = clientWith(
      vi.fn(async () => ({
        data: {
          conversationId,
          counterpartyUserId: targetUserId,
          blockedByMe: false,
          blockedByThem: true,
          canCommunicate: false,
          restriction: 'communication_unavailable',
        },
        error: null,
      })),
    );
    await expect(
      loadMarketplaceTrustContext(legacyContextClient, conversationId),
    ).rejects.toMatchObject({ category: 'invalid_response' });

    const legacyBlockClient = clientWith(
      vi.fn(async () => ({
        data: {
          targetUserId,
          blocked: false,
          changed: true,
          mutualBlocked: true,
        },
        error: null,
      })),
    );
    await expect(
      setMarketplaceUserBlocked(legacyBlockClient, { targetUserId, blocked: false }),
    ).rejects.toMatchObject({ category: 'invalid_response' });
  });

  it('adapts the generated Supabase RPC surface without exposing a stringly typed client', async () => {
    const trustModule = await import('../src/features/trust/trust-client');
    const factory = Reflect.get(trustModule, 'createTrustRpcClient');
    expect(factory).toBeTypeOf('function');
    const rawClient = {
      auth: {
        getUser: vi.fn(async () => ({
          data: { user: { id: userId } },
          error: null,
        })),
      },
      rpc: vi.fn(async () => ({
        data: {
          conversationId,
          counterpartyUserId: targetUserId,
          blockedByMe: false,
          canCommunicate: true,
          restriction: null,
        },
        error: null,
      })),
    };
    const adapter = factory(rawClient);

    await expect(loadMarketplaceTrustContext(adapter, conversationId)).resolves.toMatchObject({
      conversationId,
      counterpartyUserId: targetUserId,
    });
    expect(rawClient.rpc).toHaveBeenCalledWith('get_marketplace_trust_context', {
      p_conversation_id: conversationId,
    });

    rawClient.rpc.mockResolvedValueOnce({
      data: {
        reportId,
        status: 'submitted',
        createdAt: '2026-08-20T12:00:00+00:00',
        deduplicated: false,
      },
      error: null,
    });
    await submitMarketplaceReport(adapter, {
      targetType: 'user',
      targetId: targetUserId,
      contextConversationId: conversationId,
      reasonCategory: 'safety',
      explanation: '',
    });
    expect(rawClient.rpc).toHaveBeenLastCalledWith(
      'create_marketplace_report_v2',
      expect.objectContaining({ p_context_conversation_id: conversationId }),
    );
  });
});
