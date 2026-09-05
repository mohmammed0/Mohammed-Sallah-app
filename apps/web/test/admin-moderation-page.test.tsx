import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const auth = vi.hoisted(() => ({
  context: null as null | Record<string, unknown>,
  rpcCalls: [] as { name: string; args: unknown }[],
}));

vi.mock('@/lib/auth', () => ({
  requireModerationRead: async () => auth.context,
}));

const report = {
  reportId: '11111111-1111-4111-8111-111111111111',
  reporterId: '22222222-2222-4222-8222-222222222222',
  reportedUserId: '33333333-3333-4333-8333-333333333333',
  targetType: 'user',
  messageId: null,
  ratingId: null,
  conversationId: null,
  jobId: null,
  requestId: null,
  supportCaseId: '44444444-4444-4444-8444-444444444444',
  reasonCategory: 'safety',
  explanation: null,
  status: 'submitted',
  priority: 'normal',
  version: 1,
  createdAt: '2026-08-20T10:00:00Z',
  updatedAt: '2026-08-20T10:00:00Z',
  history: [],
  historyMeta: { limit: 50, returned: 0, total: 0, truncated: false },
};

const providerReport = {
  ...report,
  reportId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
  reporterId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
  reportedUserId: 'cccccccc-cccc-4ccc-8ccc-cccccccccccc',
  supportCaseId: 'dddddddd-dddd-4ddd-8ddd-dddddddddddd',
  explanation: null,
  createdAt: '2026-08-20T11:00:00Z',
  updatedAt: '2026-08-20T11:00:00Z',
};

function queryResult(data: readonly unknown[]) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    in: async () => ({ data, error: null }),
  };
  return builder;
}

function supportContext(assignments: readonly unknown[]) {
  const client = {
    rpc: async (name: string, args: unknown) => {
      auth.rpcCalls.push({ name, args });
      return {
        data: { reports: [report], hasMore: false, nextCursor: null },
        error: null,
      };
    },
    from: (table: string) =>
      queryResult(
        table === 'support_case_assignments'
          ? assignments
          : table === 'support_case_access_grants'
            ? []
            : [],
      ),
  };
  return {
    client,
    user: { id: '55555555-5555-4555-8555-555555555555' },
    roles: ['support_agent'],
    permissions: new Set(['support.case.read']),
  };
}

function operationsContext(
  hasMore: boolean,
  options: {
    reports?: readonly (typeof report)[];
    batchData?: unknown;
    batchError?: { code: string; message: string } | null;
    throwBatch?: boolean;
    providerDocuments?: boolean;
  } = {},
) {
  const reports = options.reports ?? [report];
  const lastReport = reports.at(-1) ?? report;
  const nextCursor = hasMore
    ? { createdAt: lastReport.createdAt, reportId: lastReport.reportId }
    : null;
  const defaultTargets = reports.map((item) => ({
    reportId: item.reportId,
    supportCaseId: item.supportCaseId,
    reportedUserId: item.reportedUserId,
    targetRole: item.reportId === providerReport.reportId ? 'provider' : 'customer',
  }));
  const client = {
    rpc: async (name: string, args: unknown) => {
      auth.rpcCalls.push({ name, args });
      if (name === 'list_open_marketplace_reports') {
        return { data: { reports, hasMore, nextCursor }, error: null };
      }
      if (name === 'get_marketplace_report_enforcement_targets') {
        if (options.throwBatch) throw new Error('BATCH_TRANSPORT_FAILED');
        return {
          data: options.batchData ?? { targets: defaultTargets },
          error: options.batchError ?? null,
        };
      }
      if (name === 'get_marketplace_report_enforcement_target') {
        const item = reports.find(
          (candidate) => candidate.reportId === (args as { p_report_id?: string }).p_report_id,
        );
        if (!item) throw new Error('UNEXPECTED_REPORT_TARGET');
        return {
          data: {
            reportId: item.reportId,
            supportCaseId: item.supportCaseId,
            reportedUserId: item.reportedUserId,
            targetRole: item.reportId === providerReport.reportId ? 'provider' : 'customer',
          },
          error: null,
        };
      }
      throw new Error(`UNEXPECTED_RPC:${name}`);
    },
    from: () => queryResult([]),
  };
  return {
    client,
    user: { id: '77777777-7777-4777-8777-777777777777' },
    roles: options.providerDocuments
      ? ['operations_admin', 'verification_reviewer']
      : ['operations_admin'],
    permissions: new Set([
      'operations.marketplace.read',
      'operations.mutate',
      ...(options.providerDocuments ? ['provider.document.read'] : []),
    ]),
  };
}

describe('moderation server page scoped-support integration', () => {
  beforeEach(() => {
    auth.context = null;
    auth.rpcCalls = [];
  });

  it('renders linked-case review state and escalation for an actively assigned support agent', async () => {
    auth.context = supportContext([
      {
        id: '66666666-6666-4666-8666-666666666666',
        case_id: report.supportCaseId,
        assignee_id: '55555555-5555-4555-8555-555555555555',
        permissions: ['read', 'internal_note'],
        assigned_at: '2026-08-20T09:00:00Z',
        expires_at: '2099-08-20T12:00:00Z',
        ended_at: null,
      },
    ]);
    const { default: ModerationPage } = await import('../app/admin/moderation/page');
    const html = renderToStaticMarkup(await ModerationPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain('حالة مراجعة حالة الدعم المرتبطة');
    expect(html).toContain(report.supportCaseId);
    expect(html).toContain(`/admin/support?caseId=${report.supportCaseId}`);
    expect(html).toContain('تصعيد البلاغ');
  });

  it('hides a report returned outside the current support assignment scope', async () => {
    auth.context = supportContext([]);
    const { default: ModerationPage } = await import('../app/admin/moderation/page');
    const html = renderToStaticMarkup(await ModerationPage({ searchParams: Promise.resolve({}) }));

    expect(html).not.toContain(report.supportCaseId);
    expect(html).not.toContain('تصعيد البلاغ');
    expect(html).toContain('لا توجد بلاغات ضمن النطاق المصرح حاليًا.');
  });

  it('does not combine another support principal internal-note grant with the assignee read grant', async () => {
    auth.context = supportContext([
      {
        id: '66666666-6666-4666-8666-666666666666',
        case_id: report.supportCaseId,
        assignee_id: '55555555-5555-4555-8555-555555555555',
        permissions: ['read'],
        assigned_at: '2026-08-20T09:00:00Z',
        expires_at: '2099-08-20T12:00:00Z',
        ended_at: null,
      },
    ]);
    const context = auth.context as ReturnType<typeof supportContext>;
    context.client.from = (table: string) =>
      queryResult(
        table === 'support_case_assignments'
          ? [
              {
                id: '66666666-6666-4666-8666-666666666666',
                case_id: report.supportCaseId,
                assignee_id: '55555555-5555-4555-8555-555555555555',
                permissions: ['read'],
                assigned_at: '2026-08-20T09:00:00Z',
                expires_at: '2099-08-20T12:00:00Z',
                ended_at: null,
              },
            ]
          : table === 'support_case_access_grants'
            ? [
                {
                  id: '88888888-8888-4888-8888-888888888888',
                  case_id: report.supportCaseId,
                  user_id: '99999999-9999-4999-8999-999999999999',
                  permissions: ['internal_note'],
                  starts_at: '2026-08-20T09:00:00Z',
                  expires_at: '2099-08-20T12:00:00Z',
                  revoked_at: null,
                },
              ]
            : [],
      );
    const { default: ModerationPage } = await import('../app/admin/moderation/page');
    const html = renderToStaticMarkup(await ModerationPage({ searchParams: Promise.resolve({}) }));

    expect(html).toContain(report.supportCaseId);
    expect(html).not.toContain('تصعيد البلاغ');
  });

  it('renders a reachable next keyset page and sends a validated cursor to the typed RPC', async () => {
    auth.context = operationsContext(true);
    const { default: ModerationPage } = await import('../app/admin/moderation/page');
    const firstHtml = renderToStaticMarkup(
      await ModerationPage({ searchParams: Promise.resolve({}) }),
    );
    expect(auth.rpcCalls[0]).toEqual({
      name: 'list_open_marketplace_reports',
      args: { p_limit: 100 },
    });
    expect(firstHtml).toContain('afterCreatedAt=2026-08-20T10%3A00%3A00Z');
    expect(firstHtml).toContain(`afterReportId=${report.reportId}`);

    auth.rpcCalls = [];
    auth.context = operationsContext(false);
    const secondHtml = renderToStaticMarkup(
      await ModerationPage({
        searchParams: Promise.resolve({
          afterCreatedAt: report.createdAt,
          afterReportId: report.reportId,
        }),
      }),
    );
    expect(auth.rpcCalls[0]).toEqual({
      name: 'list_open_marketplace_reports',
      args: {
        p_limit: 100,
        p_after_created_at: report.createdAt,
        p_after_report_id: report.reportId,
      },
    });
    expect(secondHtml).not.toContain('الصفحة التالية من البلاغات');
  });

  it('rejects a partial cursor without loading a broader first page', async () => {
    auth.context = operationsContext(false);
    const { default: ModerationPage } = await import('../app/admin/moderation/page');
    const html = renderToStaticMarkup(
      await ModerationPage({
        searchParams: Promise.resolve({ afterCreatedAt: report.createdAt }),
      }),
    );

    expect(auth.rpcCalls).toHaveLength(0);
    expect(html).toContain('تعذر تحميل طابور البلاغات بأمان.');
  });

  it('resolves a dual-role page with one exact contextual target batch and no scalar N+1 calls', async () => {
    auth.context = operationsContext(false, {
      reports: [report, providerReport],
      providerDocuments: true,
    });
    const { default: ModerationPage } = await import('../app/admin/moderation/page');
    const html = renderToStaticMarkup(await ModerationPage({ searchParams: Promise.resolve({}) }));

    expect(
      auth.rpcCalls.filter((call) => call.name === 'get_marketplace_report_enforcement_targets'),
    ).toEqual([
      {
        name: 'get_marketplace_report_enforcement_targets',
        args: { p_report_ids: [report.reportId, providerReport.reportId] },
      },
    ]);
    expect(
      auth.rpcCalls.filter((call) => call.name === 'get_marketplace_report_enforcement_target'),
    ).toHaveLength(0);
    expect(html).toContain(`/admin/enforcement/customers/${report.reportId}`);
    expect(html).toContain(`/admin/providers?providerId=${providerReport.reportedUserId}`);
    expect(html).not.toContain(`/admin/enforcement/customers/${providerReport.reportId}`);
    expect(html).not.toContain(`/admin/providers?providerId=${report.reportedUserId}`);
  });

  it.each([
    ['RPC error', { batchError: { code: 'XX000', message: 'private detail' } }],
    ['thrown transport failure', { throwBatch: true }],
    ['malformed role', { batchData: { targets: [{ ...report, targetRole: 'both' }] } }],
    [
      'mismatched reported user',
      {
        batchData: {
          targets: [
            {
              reportId: report.reportId,
              supportCaseId: report.supportCaseId,
              reportedUserId: providerReport.reportedUserId,
              targetRole: 'customer',
            },
          ],
        },
      },
    ],
    ['missing target', { batchData: { targets: [] } }],
    [
      'extra target',
      {
        batchData: {
          targets: [
            {
              reportId: report.reportId,
              supportCaseId: report.supportCaseId,
              reportedUserId: report.reportedUserId,
              targetRole: 'customer',
            },
            {
              reportId: providerReport.reportId,
              supportCaseId: providerReport.supportCaseId,
              reportedUserId: providerReport.reportedUserId,
              targetRole: 'provider',
            },
          ],
        },
      },
    ],
  ] as const)(
    'keeps the queue readable but hides all enforcement links after %s',
    async (_label, options) => {
      auth.context = operationsContext(false, options);
      const { default: ModerationPage } = await import('../app/admin/moderation/page');
      const html = renderToStaticMarkup(
        await ModerationPage({ searchParams: Promise.resolve({}) }),
      );

      expect(html).toContain('حالة مراجعة حالة الدعم المرتبطة');
      expect(html).toContain('تعذر التحقق من أهداف الإنفاذ بأمان');
      expect(html).not.toContain('/admin/enforcement/customers/');
      expect(html).not.toContain('/admin/providers?providerId=');
    },
  );
});
