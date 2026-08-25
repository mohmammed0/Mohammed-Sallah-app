import { describe, expect, it, vi } from 'vitest';
import {
  parseSupportMessages,
  sendSupportCaseMessageCommand,
} from '../src/features/support/support-conversation';

const caseId = '11111111-1111-4111-8111-111111111111';
const messageId = '22222222-2222-4222-8222-222222222222';
const idempotencyKey = '33333333-3333-4333-8333-333333333333';

describe('support conversation command', () => {
  it('sends one bounded idempotent RPC and validates the authoritative result', async () => {
    const rpc = vi.fn(async () => ({
      data: { caseId, messageId, status: 'waiting_operations' },
      error: null,
    }));

    await expect(
      sendSupportCaseMessageCommand(
        { rpc },
        { caseId, body: '  I need an update on this support case.  ' },
        idempotencyKey,
      ),
    ).resolves.toEqual({ caseId, messageId, status: 'waiting_operations' });
    expect(rpc).toHaveBeenCalledOnce();
    expect(rpc).toHaveBeenCalledWith('send_support_case_message', {
      p_case_id: caseId,
      p_body: 'I need an update on this support case.',
      p_idempotency_key: idempotencyKey,
    });
  });

  it('rejects invalid or oversized input before the database boundary', async () => {
    const rpc = vi.fn();

    await expect(
      sendSupportCaseMessageCommand({ rpc }, { caseId, body: ' '.repeat(4_001) }, idempotencyKey),
    ).rejects.toThrow();
    expect(rpc).not.toHaveBeenCalled();
  });

  it('does not expose database, path, or transport details', async () => {
    const rpc = vi.fn(async () => ({
      data: null,
      error: {
        code: 'XX000',
        message: 'private path /support/user-id and database detail',
      },
    }));

    await expect(
      sendSupportCaseMessageCommand(
        { rpc },
        { caseId, body: 'Safe support message' },
        idempotencyKey,
      ),
    ).rejects.toThrow('SUPPORT_MESSAGE_UNAVAILABLE');
    await expect(
      sendSupportCaseMessageCommand(
        { rpc },
        { caseId, body: 'Safe support message' },
        idempotencyKey,
      ),
    ).rejects.not.toThrow('/support/user-id');
  });

  it('fails closed when the response reconstructs a different case', async () => {
    const rpc = vi.fn(async () => ({
      data: {
        caseId: '44444444-4444-4444-8444-444444444444',
        messageId,
        status: 'waiting_operations',
      },
      error: null,
    }));

    await expect(
      sendSupportCaseMessageCommand(
        { rpc },
        { caseId, body: 'Safe support message' },
        idempotencyKey,
      ),
    ).rejects.toThrow('SUPPORT_MESSAGE_UNAVAILABLE');
  });
});

describe('bounded visible support conversation', () => {
  it('accepts at most 50 visible messages and rejects private rows or extra fields', () => {
    const valid = Array.from({ length: 50 }, (_, index) => ({
      id: crypto.randomUUID(),
      case_id: caseId,
      body: `message-${index}`,
      visible_to_user: true,
      created_at: '2026-08-25T12:00:00.000Z',
    }));

    expect(parseSupportMessages(valid, caseId)).toHaveLength(50);
    expect(() => parseSupportMessages([...valid, valid[0]], caseId)).toThrow();
    expect(() => parseSupportMessages([{ ...valid[0], visible_to_user: false }], caseId)).toThrow();
    expect(() =>
      parseSupportMessages([{ ...valid[0], private_path: '/private/case' }], caseId),
    ).toThrow();
    expect(() =>
      parseSupportMessages(
        [{ ...valid[0], case_id: '55555555-5555-4555-8555-555555555555' }],
        caseId,
      ),
    ).toThrow('SUPPORT_MESSAGE_CASE_MISMATCH');
  });

  it('turns the newest bounded database window back into chronological display order', () => {
    const newestFirst = [
      { id: crypto.randomUUID(), body: 'newest', created_at: '2026-08-25T12:02:00.000Z' },
      { id: crypto.randomUUID(), body: 'middle', created_at: '2026-08-25T12:01:00.000Z' },
      { id: crypto.randomUUID(), body: 'oldest', created_at: '2026-08-25T12:00:00.000Z' },
    ].map((message) => ({ ...message, case_id: caseId, visible_to_user: true as const }));

    expect(parseSupportMessages(newestFirst, caseId).map((message) => message.body)).toEqual([
      'oldest',
      'middle',
      'newest',
    ]);
  });
});
