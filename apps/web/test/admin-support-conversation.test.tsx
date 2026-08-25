import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const caseId = '11111111-1111-4111-8111-111111111111';
const actorId = '22222222-2222-4222-8222-222222222222';
const messageId = '33333333-3333-4333-8333-333333333333';
const intentId = '44444444-4444-4444-8444-444444444444';

const state = vi.hoisted(() => ({
  caseStatus: 'open',
  messageError: null as null | { code: string; message: string },
  messageRows: [] as unknown[],
  queryLog: [] as Array<{ table: string; action: string; args: unknown[] }>,
  rpcCalls: [] as Array<{ name: string; args: unknown }>,
  rpcError: null as null | { code: string; message: string },
  redirectPaths: [] as string[],
}));

function query(table: string) {
  const builder = {
    select: (...args: unknown[]) => {
      state.queryLog.push({ table, action: 'select', args });
      return builder;
    },
    eq: (...args: unknown[]) => {
      state.queryLog.push({ table, action: 'eq', args });
      return builder;
    },
    not: (...args: unknown[]) => {
      state.queryLog.push({ table, action: 'not', args });
      return builder;
    },
    order: (...args: unknown[]) => {
      state.queryLog.push({ table, action: 'order', args });
      return builder;
    },
    limit: async (...args: unknown[]) => {
      state.queryLog.push({ table, action: 'limit', args });
      if (table === 'support_cases') {
        return {
          data: [
            {
              id: caseId,
              subject: 'حالة دعم آمنة',
              topic: 'general',
              priority: 'normal',
              status: state.caseStatus,
              opened_by: actorId,
              created_at: '2026-08-25T12:00:00.000Z',
              updated_at: '2026-08-25T12:01:00.000Z',
              support_case_assignments: [],
              support_case_access_grants: [],
            },
          ],
          error: null,
        };
      }
      if (table === 'support_case_messages') {
        return { data: state.messageRows, error: state.messageError };
      }
      return { data: [], error: null };
    },
  };
  return builder;
}

const client = {
  from: (table: string) => query(table),
  rpc: async (name: string, args: unknown) => {
    state.rpcCalls.push({ name, args });
    return {
      data: {
        caseId,
        messageId,
        status: 'waiting_customer',
      },
      error: state.rpcError,
    };
  },
};

vi.mock('@/lib/auth', () => ({
  requireAnyAdmin: async () => ({
    client,
    roles: ['support_agent'],
    permissions: new Set(['support.case.read']),
  }),
  requireAdmin: vi.fn(),
  requireModerationActionSession: vi.fn(),
  requireModerationEscalation: vi.fn(),
  requireModerationOperations: vi.fn(),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    state.redirectPaths.push(path);
    throw new Error('NEXT_REDIRECT');
  },
}));

describe('operations support conversation page', () => {
  beforeEach(() => {
    state.caseStatus = 'open';
    state.messageError = null;
    state.messageRows = [
      {
        id: messageId,
        case_id: caseId,
        body: 'رسالة دعم مرئية ومحدودة',
        visible_to_user: true,
        created_at: '2026-08-25T12:00:00.000Z',
      },
    ];
    state.queryLog = [];
    state.rpcCalls = [];
    state.rpcError = null;
    state.redirectPaths = [];
  });

  it('loads only 50 user-visible messages for the exact authorized case and renders a reply', async () => {
    const { default: SupportPage } = await import('../app/admin/support/page');
    const html = renderToStaticMarkup(
      await SupportPage({ searchParams: Promise.resolve({ caseId }) }),
    );

    expect(state.queryLog).toContainEqual({
      table: 'support_case_messages',
      action: 'eq',
      args: ['case_id', caseId],
    });
    expect(state.queryLog).toContainEqual({
      table: 'support_case_messages',
      action: 'eq',
      args: ['visible_to_user', true],
    });
    expect(state.queryLog).toContainEqual({
      table: 'support_case_messages',
      action: 'limit',
      args: [50],
    });
    expect(state.queryLog).toContainEqual({
      table: 'support_case_messages',
      action: 'order',
      args: ['created_at', { ascending: false }],
    });
    expect(state.queryLog).toContainEqual({
      table: 'support_case_messages',
      action: 'order',
      args: ['id', { ascending: false }],
    });
    const select = state.queryLog.find(
      (item) => item.table === 'support_case_messages' && item.action === 'select',
    );
    expect(select?.args.join(',')).not.toContain('sender_id');
    expect(html).toContain('رسالة دعم مرئية ومحدودة');
    expect(html).toContain('name="body"');
    expect(html).toContain('name="commandIntentId"');
    expect(html).not.toContain(actorId);
  });

  it('fails safely on malformed conversation rows and does not render their private data', async () => {
    state.messageRows = [
      {
        id: messageId,
        case_id: caseId,
        body: 'private database detail',
        visible_to_user: true,
        created_at: '2026-08-25T12:00:00.000Z',
        storage_path: '/private/support/path',
      },
    ];
    const { default: SupportPage } = await import('../app/admin/support/page');
    const html = renderToStaticMarkup(
      await SupportPage({ searchParams: Promise.resolve({ caseId }) }),
    );

    expect(html).toContain('تعذر تحميل أحد طوابير العمليات.');
    expect(html).not.toContain('/private/support/path');
    expect(html).not.toContain('private database detail');
  });

  it('rejects a valid-looking message returned for a different support case', async () => {
    state.messageRows = [
      {
        id: messageId,
        case_id: '55555555-5555-4555-8555-555555555555',
        body: 'رسالة من حالة أخرى',
        visible_to_user: true,
        created_at: '2026-08-25T12:00:00.000Z',
      },
    ];
    const { default: SupportPage } = await import('../app/admin/support/page');
    const html = renderToStaticMarkup(
      await SupportPage({ searchParams: Promise.resolve({ caseId }) }),
    );

    expect(html).toContain('تعذر تحميل أحد طوابير العمليات.');
    expect(html).not.toContain('رسالة من حالة أخرى');
  });

  it('does not offer a reply form for resolved or closed cases', async () => {
    state.caseStatus = 'closed';
    const { default: SupportPage } = await import('../app/admin/support/page');
    const html = renderToStaticMarkup(
      await SupportPage({ searchParams: Promise.resolve({ caseId }) }),
    );

    expect(html).toContain('رسالة دعم مرئية ومحدودة');
    expect(html).not.toContain('name="body"');
  });

  it('renders only the support-specific safe reply error category', async () => {
    const { default: SupportPage } = await import('../app/admin/support/page');
    const html = renderToStaticMarkup(
      await SupportPage({ searchParams: Promise.resolve({ caseId, error: 'unavailable' }) }),
    );

    expect(html).toContain('تعذر إرسال الرد. تحقق من الاتصال وحالة الحالة ثم أعد المحاولة.');
    expect(html).not.toContain('private database');
  });
});

describe('operations support reply action', () => {
  beforeEach(() => {
    state.rpcCalls = [];
    state.rpcError = null;
    state.redirectPaths = [];
  });

  function replyForm(body = 'رد فريق الدعم المصرح') {
    const formData = new FormData();
    formData.set('caseId', caseId);
    formData.set('body', body);
    formData.set('commandIntentId', intentId);
    return formData;
  }

  it('sends one authorized RPC with a durable reconstructed key', async () => {
    const { sendSupportCaseMessage } = await import('../app/admin/actions');
    await expect(sendSupportCaseMessage(replyForm())).rejects.toThrow('NEXT_REDIRECT');

    expect(state.rpcCalls).toEqual([
      {
        name: 'send_support_case_message',
        args: {
          p_case_id: caseId,
          p_body: 'رد فريق الدعم المصرح',
          p_idempotency_key: intentId,
        },
      },
    ]);
    expect(state.redirectPaths).toEqual([
      `/admin/support?caseId=${caseId}&notice=message_sent&confirmedIntentId=${intentId}`,
    ]);
  });

  it('rejects invalid input before calling Supabase', async () => {
    const { sendSupportCaseMessage } = await import('../app/admin/actions');
    await expect(sendSupportCaseMessage(replyForm(' '.repeat(4001)))).rejects.toThrow(
      'NEXT_REDIRECT',
    );

    expect(state.rpcCalls).toEqual([]);
    expect(state.redirectPaths).toEqual(['/admin/support?error=validation']);
  });

  it('projects raw RPC failures to one safe retry category', async () => {
    state.rpcError = { code: 'XX000', message: 'private database and user path' };
    const { sendSupportCaseMessage } = await import('../app/admin/actions');
    await expect(sendSupportCaseMessage(replyForm())).rejects.toThrow('NEXT_REDIRECT');

    expect(state.redirectPaths).toEqual([`/admin/support?caseId=${caseId}&error=unavailable`]);
    expect(state.redirectPaths.join('')).not.toContain('private database');
  });
});
