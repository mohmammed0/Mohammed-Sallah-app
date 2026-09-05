import { describe, expect, it, vi } from 'vitest';
import { openSupportCaseCommand } from '../src/features/support/open-support-case';

const caseId = '11111111-1111-4111-8111-111111111111';

describe('atomic support intake command', () => {
  it('opens the case and initial message through one idempotent RPC', async () => {
    const rpc = vi.fn(async () => ({
      data: { caseId, status: 'open' },
      error: null,
    }));

    await expect(
      openSupportCaseCommand(
        { rpc },
        {
          subject: 'Current request problem',
          body: 'I need the support team to follow up on this issue.',
        },
        '22222222-2222-4222-8222-222222222222',
      ),
    ).resolves.toEqual({ caseId, status: 'open' });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('open_support_case', {
      p_subject: 'Current request problem',
      p_body: 'I need the support team to follow up on this issue.',
      p_topic: 'general',
      p_idempotency_key: '22222222-2222-4222-8222-222222222222',
    });
  });

  it('rejects invalid intake before making a database call', async () => {
    const rpc = vi.fn();

    await expect(
      openSupportCaseCommand(
        { rpc },
        { subject: 'short', body: 'short' },
        '22222222-2222-4222-8222-222222222222',
      ),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not expose raw database errors to its caller', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { code: 'XX000', message: 'private database detail' },
    }));

    await expect(
      openSupportCaseCommand(
        { rpc },
        {
          subject: 'Current request problem',
          body: 'I need the support team to follow up on this issue.',
        },
        '22222222-2222-4222-8222-222222222222',
      ),
    ).rejects.toThrow('SUPPORT_CASE_UNAVAILABLE');
  });

  it('preserves a safe retryable category for offline recovery without exposing details', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: { name: 'TypeError', message: 'Failed to fetch https://private.invalid' },
    }));

    await expect(
      openSupportCaseCommand(
        { rpc },
        {
          subject: 'Current request problem',
          body: 'I need the support team to follow up on this issue.',
        },
        '22222222-2222-4222-8222-222222222222',
      ),
    ).rejects.toThrow('SUPPORT_CASE_NETWORK_UNAVAILABLE');
  });
});
