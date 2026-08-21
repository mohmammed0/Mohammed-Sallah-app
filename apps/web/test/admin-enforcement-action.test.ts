import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  targetRole: 'customer' as 'customer' | 'provider',
  targetDataOverride: null as null | unknown,
  targetError: null as null | { code?: string; message?: string },
  statusError: null as null | { code?: string; message?: string },
  moderationError: null as null | { code?: string; message?: string },
  statusPayloads: [] as Record<string, unknown>[],
  redirectPaths: [] as string[],
  rpcCalls: [] as { name: string; payload: unknown }[],
}));

const reportId = '11111111-1111-4111-8111-111111111111';
const reportedUserId = '33333333-3333-4333-8333-333333333333';
const target = () => ({
  reportId,
  supportCaseId: '44444444-4444-4444-8444-444444444444',
  reportedUserId,
  targetRole: state.targetRole,
});

const client = {
  rpc: async (name: string, payload: unknown) => {
    state.rpcCalls.push({ name, payload });
    if (name === 'get_marketplace_report_enforcement_target') {
      return { data: state.targetDataOverride ?? target(), error: state.targetError };
    }
    if (name === 'admin_set_customer_status') {
      state.statusPayloads.push(payload as Record<string, unknown>);
      return { data: null, error: state.statusError };
    }
    if (name === 'triage_marketplace_report' || name === 'resolve_marketplace_report') {
      return { data: null, error: state.moderationError };
    }
    throw new Error(`UNEXPECTED_RPC:${name}`);
  },
};

vi.mock('@/lib/auth', () => ({
  requireAdmin: async () => ({ client }),
  requireAnyAdmin: async () => ({ client }),
  requireModerationActionSession: async () => ({ client }),
  requireModerationEscalation: async () => ({ client }),
  requireModerationOperations: async () => ({ client }),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    state.redirectPaths.push(path);
    throw new Error('NEXT_REDIRECT');
  },
}));

function enforcementFormData(overrides: Readonly<Record<string, string>> = {}) {
  const formData = new FormData();
  formData.set('customerId', '55555555-5555-4555-8555-555555555555');
  formData.set('status', 'suspended');
  formData.set('reason', 'Documented safety enforcement decision');
  formData.set('commandIntentId', '66666666-6666-4666-8666-666666666666');
  for (const [key, value] of Object.entries(overrides)) formData.set(key, value);
  return formData;
}

describe('report-bound customer enforcement action', () => {
  beforeEach(() => {
    state.targetRole = 'customer';
    state.targetDataOverride = null;
    state.targetError = null;
    state.statusError = null;
    state.moderationError = null;
    state.statusPayloads = [];
    state.redirectPaths = [];
    state.rpcCalls = [];
  });

  it('ignores a forged customer ID, uses the exact target RPC, and redirects to localized success', async () => {
    const { setCustomerStatus } = await import('../app/admin/actions');
    await expect(setCustomerStatus({ reportId }, enforcementFormData())).rejects.toThrow(
      'NEXT_REDIRECT',
    );

    expect(state.rpcCalls[0]).toEqual({
      name: 'get_marketplace_report_enforcement_target',
      payload: { p_report_id: reportId },
    });
    expect(state.statusPayloads).toHaveLength(1);
    expect(state.statusPayloads[0]).toMatchObject({ p_customer_id: reportedUserId });
    expect(state.statusPayloads[0]).not.toMatchObject({
      p_customer_id: '55555555-5555-4555-8555-555555555555',
    });
    expect(state.redirectPaths).toEqual([
      `/admin/enforcement/customers/${reportId}?notice=updated&confirmedIntentId=66666666-6666-4666-8666-666666666666`,
    ]);
  });

  it('preserves the durable replay key for response-loss reconstruction', async () => {
    const { setCustomerStatus } = await import('../app/admin/actions');
    for (let attempt = 0; attempt < 2; attempt += 1) {
      state.redirectPaths = [];
      await expect(setCustomerStatus({ reportId }, enforcementFormData())).rejects.toThrow(
        'NEXT_REDIRECT',
      );
    }

    expect(state.statusPayloads).toHaveLength(2);
    expect(state.statusPayloads[0]?.p_idempotency_key).toBe(
      state.statusPayloads[1]?.p_idempotency_key,
    );
  });

  it('fails closed through a safe localized path when the target is a provider', async () => {
    state.targetRole = 'provider';
    const { setCustomerStatus } = await import('../app/admin/actions');

    await expect(setCustomerStatus({ reportId }, enforcementFormData())).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(state.statusPayloads).toHaveLength(0);
    expect(state.redirectPaths).toEqual([
      `/admin/enforcement/customers/${reportId}?error=not_found`,
    ]);
  });

  it.each([
    [{ code: '42501', message: 'MODERATION_PERMISSION_REQUIRED' }, 'permission'],
    [{ code: 'P0001', message: 'REPORT_ENFORCEMENT_TARGET_NOT_AVAILABLE' }, 'not_found'],
    [{ code: 'XX000', message: 'private database detail' }, 'unavailable'],
  ] as const)('maps target RPC failure to safe redirect', async (targetError, category) => {
    state.targetError = targetError;
    const { setCustomerStatus } = await import('../app/admin/actions');

    await expect(setCustomerStatus({ reportId }, enforcementFormData())).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(state.redirectPaths).toEqual([
      `/admin/enforcement/customers/${reportId}?error=${category}`,
    ]);
  });

  it('redirects validation and status RPC failures without exposing raw errors', async () => {
    const { setCustomerStatus } = await import('../app/admin/actions');
    await expect(
      setCustomerStatus({ reportId }, enforcementFormData({ reason: 'no' })),
    ).rejects.toThrow('NEXT_REDIRECT');
    expect(state.redirectPaths).toEqual([
      `/admin/enforcement/customers/${reportId}?error=validation`,
    ]);
    expect(state.statusPayloads).toHaveLength(0);

    state.redirectPaths = [];
    state.statusError = { code: 'P0001', message: 'IDEMPOTENCY_KEY_CONFLICT raw detail' };
    await expect(setCustomerStatus({ reportId }, enforcementFormData())).rejects.toThrow(
      'NEXT_REDIRECT',
    );
    expect(state.redirectPaths).toEqual([
      `/admin/enforcement/customers/${reportId}?error=conflict`,
    ]);
    expect(state.redirectPaths[0]).not.toContain('confirmedIntentId');
  });

  it('confirms the submitted moderation intent only on an explicit successful action redirect', async () => {
    const { triageMarketplaceReport } = await import('../app/admin/actions');
    const formData = new FormData();
    formData.set('reportId', reportId);
    formData.set('expectedVersion', '1');
    formData.set('commandIntentId', '77777777-7777-4777-8777-777777777777');
    formData.set('reason', 'Documented moderation triage decision');
    formData.set('priority', 'urgent');

    await expect(triageMarketplaceReport(formData)).rejects.toThrow('NEXT_REDIRECT');
    expect(state.redirectPaths).toEqual([
      '/admin/moderation?notice=triaged&confirmedIntentId=77777777-7777-4777-8777-777777777777',
    ]);

    state.redirectPaths = [];
    state.moderationError = { code: 'XX000', message: 'private transport detail' };
    await expect(triageMarketplaceReport(formData)).rejects.toThrow('NEXT_REDIRECT');
    expect(state.redirectPaths).toEqual(['/admin/moderation?error=unavailable']);
    expect(state.redirectPaths[0]).not.toContain('confirmedIntentId');
  });
});
