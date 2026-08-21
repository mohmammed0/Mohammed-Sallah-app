import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { adminCommandKey } from '../src/lib/admin-command-intent';

function source(path: string): string {
  return readFileSync(new URL(path, import.meta.url), 'utf8');
}

function optionalSource(path: string): string {
  try {
    return source(path);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return '';
    throw error;
  }
}

describe('scoped admin workflow surfaces', () => {
  it('uses the minimal finance queue and preserves intent then confirmation actions', () => {
    const page = source('../app/admin/finance/page.tsx');
    expect(page).toContain("rpc('get_finance_review_queue')");
    expect(page).toContain('resolveDispute');
    expect(page).toContain('confirmFinancialAction');
    expect(page).not.toContain(".from('payments')");
    expect(page).not.toContain(".from('support_cases')");
  });

  it('exposes assignment, revocation, temporary access, and exact-location controls', () => {
    const page = source('../app/admin/support/page.tsx');
    expect(page).toContain('assignSupportCase');
    expect(page).toContain('endSupportAssignment');
    expect(page).toContain('grantSupportAccess');
    expect(page).toContain('revokeSupportAccess');
    expect(page).toContain('name="exactLocation"');
    expect(page).toContain('name="expiresAt"');
  });

  it('loads customer PII through the audited projection rather than profiles', () => {
    const page = source('../app/admin/customers/page.tsx');
    expect(page).toContain("rpc('list_customer_pii'");
    expect(page).not.toContain(".from('profiles')");
  });

  it('renders a durable command intent into every mutating form', () => {
    for (const pagePath of [
      '../app/admin/providers/page.tsx',
      '../app/admin/catalog/page.tsx',
      '../app/admin/customers/page.tsx',
      '../app/admin/finance/page.tsx',
      '../app/admin/support/page.tsx',
      '../app/admin/moderation/page.tsx',
    ]) {
      const page = source(pagePath);
      const forms = page.match(/<form\s[\s\S]*?action=/g)?.length ?? 0;
      const intents = page.match(/<DurableCommandIntent/g)?.length ?? 0;
      expect(intents).toBe(forms);
      expect(page).toContain('crypto.randomUUID()');
    }
    const component = source('../src/components/durable-command-intent.tsx');
    expect(component).toContain('localStorage.getItem');
    expect(component).toContain('localStorage.setItem');
    expect(component).toContain('normalizedExpiresAt');
    expect(component).toContain('id: crypto.randomUUID()');
    expect(component).toContain('setIntent(nextIntent)');
    expect(component).toContain('const explicitConfirmation = confirmedIntentId !== undefined');
    expect(component).toContain('wasPending.current = true');
    expect(source('../app/admin/catalog/page.tsx')).not.toContain('confirmedIntentId=');
    expect(source('../app/admin/moderation/page.tsx')).toContain('confirmedIntentId=');
  });

  it('renders a page-level confirmed-intent consumer only from validated success state', () => {
    const moderation = source('../app/admin/moderation/page.tsx');
    const enforcement = source('../app/admin/enforcement/customers/[reportId]/page.tsx');
    expect(moderation).toContain('ConfirmedCommandIntentConsumer');
    expect(enforcement).toContain('ConfirmedCommandIntentConsumer');
    expect(moderation).toContain('noticeKey && !errorKey ? parseConfirmedIntentId');
    expect(enforcement).toContain('notice && !errorKey ? parseConfirmedIntentId');
    expect(moderation).not.toContain('intentKey={query');
    expect(enforcement).not.toContain('intentKey={query');
  });

  it('normalizes support expiry before hashing and reuses that exact value', () => {
    const actions = source('../app/admin/actions.ts');
    const normalized = actions.indexOf("formData.get('normalizedExpiresAt')");
    const commandPayload = actions.indexOf(
      'const commandPayload = { ...input, expiresAt: input.expiresAt }',
    );
    const rpcValue = actions.indexOf('p_expires_at: input.expiresAt');
    const hash = actions.indexOf("formCommandKey('support-assignment', formData, commandPayload)");
    expect(normalized).toBeGreaterThan(-1);
    expect(commandPayload).toBeGreaterThan(normalized);
    expect(rpcValue).toBeGreaterThan(commandPayload);
    expect(hash).toBeGreaterThan(rpcValue);
    expect(actions).not.toContain('Date.now()');
  });

  it('reconstructs the same browser action after response loss with one command key', () => {
    const intentId = '11111111-1111-4111-8111-111111111111';
    const normalized = {
      caseId: '22222222-2222-4222-8222-222222222222',
      assigneeId: '33333333-3333-4333-8333-333333333333',
      reason: 'Investigate the controlled support case',
      exactLocation: false,
      expiresAt: '2026-08-19T18:00:00.000Z',
    };
    const firstKey = adminCommandKey('support-assignment', intentId, normalized);
    const reconstructedKey = adminCommandKey('support-assignment', intentId, {
      expiresAt: normalized.expiresAt,
      exactLocation: false,
      reason: normalized.reason,
      assigneeId: normalized.assigneeId,
      caseId: normalized.caseId,
    });
    expect(reconstructedKey).toBe(firstKey);
    const authoritativeAssignments = new Map<string, string>();
    authoritativeAssignments.set(firstKey, 'assignment-1');
    authoritativeAssignments.set(reconstructedKey, 'assignment-1');
    expect(authoritativeAssignments).toHaveLength(1);
    expect(
      adminCommandKey('support-assignment', '44444444-4444-4444-8444-444444444444', normalized),
    ).not.toBe(firstKey);
  });

  it('parses only a bounded open keyset page and rejects finals or private fields', async () => {
    const modulePath = '../src/lib/moderation';
    const loading = import(modulePath) as Promise<Record<string, unknown>>;
    await expect(loading).resolves.toBeDefined();
    const moderation = await loading;
    const parseQueue = moderation.parseOpenModerationQueue as
      ((value: unknown) => unknown) | undefined;
    expect(parseQueue).toBeTypeOf('function');
    if (!parseQueue) return;

    const safeReport = {
      reportId: '11111111-1111-4111-8111-111111111111',
      reporterId: '22222222-2222-4222-8222-222222222222',
      reportedUserId: '33333333-3333-4333-8333-333333333333',
      targetType: 'message',
      messageId: '44444444-4444-4444-8444-444444444444',
      ratingId: null,
      conversationId: '55555555-5555-4555-8555-555555555555',
      jobId: '66666666-6666-4666-8666-666666666666',
      requestId: '77777777-7777-4777-8777-777777777777',
      supportCaseId: '88888888-8888-4888-8888-888888888888',
      reasonCategory: 'harassment',
      explanation: 'Repeated abusive language in the conversation.',
      status: 'submitted',
      priority: 'normal',
      version: 1,
      createdAt: '2026-08-20T09:30:00+00:00',
      updatedAt: '2026-08-20T09:30:00+00:00',
      history: [
        {
          eventId: '99999999-9999-4999-8999-999999999999',
          eventType: 'submitted',
          fromStatus: null,
          toStatus: 'submitted',
          reason: 'harassment',
          payload: { priority: 'normal', targetType: 'message' },
          actorId: '22222222-2222-4222-8222-222222222222',
          createdAt: '2026-08-20T09:30:00+00:00',
        },
      ],
      historyMeta: { limit: 50, returned: 1, total: 1, truncated: false },
      textSnapshot: 'A bounded text snapshot',
      attachmentEvidence: [
        {
          attachmentId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
          uploadId: 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',
          mimeType: 'image/jpeg',
          sizeBytes: 1024,
          contentSha256: 'a'.repeat(64),
        },
      ],
    };
    const page = {
      reports: [safeReport],
      hasMore: true,
      nextCursor: { createdAt: safeReport.createdAt, reportId: safeReport.reportId },
    };
    expect(parseQueue(page)).toEqual(page);
    expect(() => parseQueue({ ...page, reports: [{ ...safeReport, status: 'resolved' }] })).toThrow(
      'OPEN_MODERATION_QUEUE_INVALID',
    );
    expect(() =>
      parseQueue({ ...page, reports: [{ ...safeReport, exactLocation: '24.0,46.0' }] }),
    ).toThrow('OPEN_MODERATION_QUEUE_INVALID');
    expect(() =>
      parseQueue({ ...page, reports: [{ ...safeReport, signedUrl: 'https://private.invalid' }] }),
    ).toThrow('OPEN_MODERATION_QUEUE_INVALID');
    expect(() => parseQueue({ ...page, hasMore: false })).toThrow('OPEN_MODERATION_QUEUE_INVALID');
    expect(() =>
      parseQueue({
        ...page,
        reports: [
          {
            ...safeReport,
            historyMeta: { limit: 50, returned: 0, total: 1, truncated: true },
          },
        ],
      }),
    ).toThrow('OPEN_MODERATION_QUEUE_INVALID');
    expect(() =>
      parseQueue({
        ...page,
        reports: [
          safeReport,
          {
            ...safeReport,
            createdAt: '2026-08-20T09:31:00+00:00',
            updatedAt: '2026-08-20T09:31:00+00:00',
          },
        ],
        nextCursor: {
          createdAt: '2026-08-20T09:31:00+00:00',
          reportId: safeReport.reportId,
        },
      }),
    ).toThrow('OPEN_MODERATION_QUEUE_INVALID');
    expect(() =>
      parseQueue({
        ...page,
        reports: [
          {
            ...safeReport,
            reportId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
            createdAt: '2026-08-20T09:31:00+00:00',
          },
          safeReport,
        ],
      }),
    ).toThrow('OPEN_MODERATION_QUEUE_INVALID');
    expect(() =>
      parseQueue({
        ...page,
        reports: [
          { ...safeReport, reportId: 'ffffffff-ffff-4fff-8fff-ffffffffffff' },
          { ...safeReport, reportId: '00000000-0000-4000-8000-000000000000' },
        ],
        nextCursor: {
          createdAt: safeReport.createdAt,
          reportId: '00000000-0000-4000-8000-000000000000',
        },
      }),
    ).toThrow('OPEN_MODERATION_QUEUE_INVALID');
    expect(() =>
      parseQueue({
        ...page,
        nextCursor: {
          createdAt: safeReport.createdAt,
          reportId: 'ffffffff-ffff-4fff-8fff-ffffffffffff',
        },
      }),
    ).toThrow('OPEN_MODERATION_QUEUE_INVALID');
  });

  it('accepts only complete canonical moderation keyset cursor search params', async () => {
    const moderation = (await import('../src/lib/moderation')) as Record<string, unknown>;
    const parseCursor = moderation.parseModerationPageCursor as
      ((value: unknown) => unknown) | undefined;
    expect(parseCursor).toBeTypeOf('function');
    if (!parseCursor) return;
    const createdAt = '2026-08-20T09:30:00+00:00';
    const reportId = '11111111-1111-4111-8111-111111111111';
    expect(parseCursor({})).toEqual({ afterCreatedAt: null, afterReportId: null });
    expect(parseCursor({ afterCreatedAt: createdAt, afterReportId: reportId })).toEqual({
      afterCreatedAt: createdAt,
      afterReportId: reportId,
    });
    expect(() => parseCursor({ afterCreatedAt: createdAt })).toThrow(
      'MODERATION_PAGE_CURSOR_INVALID',
    );
    expect(() => parseCursor({ afterCreatedAt: [createdAt], afterReportId: reportId })).toThrow(
      'MODERATION_PAGE_CURSOR_INVALID',
    );
    expect(() => parseCursor({ afterCreatedAt: createdAt, afterReportId: 'not-a-uuid' })).toThrow(
      'MODERATION_PAGE_CURSOR_INVALID',
    );
  });

  it('validates durable moderation commands and maps database failures to safe categories', async () => {
    const modulePath = '../src/lib/moderation';
    const moderation = (await import(modulePath)) as Record<string, unknown>;
    const parseCommand = moderation.parseModerationCommand as
      ((value: unknown) => Record<string, unknown>) | undefined;
    const errorCategory = moderation.moderationErrorCategory as
      ((value: unknown) => string) | undefined;
    expect(parseCommand).toBeTypeOf('function');
    expect(errorCategory).toBeTypeOf('function');
    if (!parseCommand || !errorCategory) return;

    const valid = {
      action: 'triage',
      reportId: '11111111-1111-4111-8111-111111111111',
      expectedVersion: '7',
      commandIntentId: '22222222-2222-4222-8222-222222222222',
      reason: '  Escalating priority after reviewed evidence.  ',
      priority: 'urgent',
    };
    expect(parseCommand(valid)).toEqual({
      ...valid,
      expectedVersion: 7,
      reason: 'Escalating priority after reviewed evidence.',
    });
    expect(() => parseCommand({ ...valid, expectedVersion: null })).toThrow(
      'MODERATION_COMMAND_INVALID',
    );
    expect(() => parseCommand({ ...valid, reason: 'no' })).toThrow('MODERATION_COMMAND_INVALID');
    expect(() => parseCommand({ ...valid, reason: 'x'.repeat(2001) })).toThrow(
      'MODERATION_COMMAND_INVALID',
    );
    expect(errorCategory({ code: 'P0001', message: 'VERSION_CONFLICT' })).toBe('conflict');
    expect(errorCategory({ code: '42501', message: 'private policy details' })).toBe('permission');
    expect(errorCategory({ code: 'XX000', message: 'raw database secret detail' })).toBe(
      'unavailable',
    );
  });

  it('never unions support capabilities across principals for one report', async () => {
    const modulePath = '../src/lib/moderation';
    const moderation = (await import(modulePath)) as Record<string, unknown>;
    const reviewFor = moderation.moderationCaseReviewFor as
      | ((
          caseId: string,
          access: readonly Record<string, unknown>[],
          principalId: string | null,
        ) => {
          entries: readonly unknown[];
          scope: unknown;
        })
      | undefined;
    expect(reviewFor).toBeTypeOf('function');
    if (!reviewFor) return;
    const caseId = '11111111-1111-4111-8111-111111111111';
    const principalA = '33333333-3333-4333-8333-333333333333';
    const principalB = '66666666-6666-4666-8666-666666666666';
    const access = [
      {
        id: '22222222-2222-4222-8222-222222222222',
        caseId,
        principalId: principalA,
        kind: 'assignment',
        state: 'active',
        permissions: ['read'],
      },
      {
        id: '55555555-5555-4555-8555-555555555555',
        caseId,
        principalId: principalB,
        kind: 'delegation',
        state: 'active',
        permissions: ['evidence', 'internal_note'],
      },
    ];
    expect(reviewFor(caseId, access, principalA).scope).toEqual({
      kind: 'assignment',
      permissions: ['read'],
    });
    expect(reviewFor(caseId, access, principalB).scope).toEqual({
      kind: 'delegation',
      permissions: ['internal_note', 'evidence'],
    });
    expect(reviewFor(caseId, access, null)).toEqual({ entries: access, scope: null });
  });

  it('strictly classifies every linked assignment and delegation lifecycle state', async () => {
    const moderation = (await import('../src/lib/moderation')) as Record<string, unknown>;
    const parseAccess = moderation.parseModerationCaseAccess as
      | ((assignments: readonly unknown[], delegations: readonly unknown[], now: Date) => unknown)
      | undefined;
    expect(parseAccess).toBeTypeOf('function');
    if (!parseAccess) return;
    const caseId = '11111111-1111-4111-8111-111111111111';
    const now = new Date('2026-08-20T12:00:00Z');
    const assignment = (overrides: Readonly<Record<string, unknown>>) => ({
      id: crypto.randomUUID(),
      case_id: caseId,
      assignee_id: '22222222-2222-4222-8222-222222222222',
      permissions: ['read'],
      assigned_at: '2026-08-20T10:00:00Z',
      expires_at: null,
      ended_at: null,
      ...overrides,
    });
    const delegation = (overrides: Readonly<Record<string, unknown>>) => ({
      id: crypto.randomUUID(),
      case_id: caseId,
      user_id: '33333333-3333-4333-8333-333333333333',
      permissions: ['read', 'evidence'],
      starts_at: '2026-08-20T11:00:00Z',
      expires_at: '2026-08-20T13:00:00Z',
      revoked_at: null,
      ...overrides,
    });

    expect(
      parseAccess(
        [
          assignment({}),
          assignment({ expires_at: '2026-08-20T11:59:59Z' }),
          assignment({ ended_at: '2026-08-20T11:30:00Z' }),
        ],
        [
          delegation({}),
          delegation({ starts_at: '2026-08-20T12:30:00Z', expires_at: '2026-08-20T14:00:00Z' }),
          delegation({ starts_at: '2026-08-20T09:00:00Z', expires_at: '2026-08-20T11:59:59Z' }),
          delegation({ revoked_at: '2026-08-20T11:30:00Z' }),
        ],
        now,
      ),
    ).toEqual([
      expect.objectContaining({ kind: 'assignment', state: 'active' }),
      expect.objectContaining({ kind: 'assignment', state: 'expired' }),
      expect.objectContaining({ kind: 'assignment', state: 'ended' }),
      expect.objectContaining({ kind: 'delegation', state: 'active' }),
      expect.objectContaining({ kind: 'delegation', state: 'scheduled' }),
      expect.objectContaining({ kind: 'delegation', state: 'expired' }),
      expect.objectContaining({ kind: 'delegation', state: 'revoked' }),
    ]);
    expect(() => parseAccess([assignment({ private_note: 'must fail closed' })], [], now)).toThrow(
      'MODERATION_CASE_ACCESS_INVALID',
    );
  });

  it('strictly parses only the contextual enforcement-target RPC projection', async () => {
    const moderation = (await import('../src/lib/moderation')) as Record<string, unknown>;
    const parseTarget = moderation.parseModerationEnforcementTarget as
      ((value: unknown) => unknown) | undefined;
    expect(parseTarget).toBeTypeOf('function');
    if (!parseTarget) return;
    const reportId = '11111111-1111-4111-8111-111111111111';
    const reportedUserId = '33333333-3333-4333-8333-333333333333';
    const target = {
      reportId,
      supportCaseId: '44444444-4444-4444-8444-444444444444',
      reportedUserId,
      targetRole: 'customer',
    };
    expect(parseTarget(target)).toEqual(target);
    expect(parseTarget({ ...target, targetRole: 'provider' })).toEqual({
      ...target,
      targetRole: 'provider',
    });
    expect(() => parseTarget({ ...target, targetRole: 'dual' })).toThrow(
      'MODERATION_ENFORCEMENT_TARGET_INVALID',
    );
    expect(() => parseTarget({ ...target, providerProfile: true })).toThrow(
      'MODERATION_ENFORCEMENT_TARGET_INVALID',
    );
  });

  it('accepts only a complete input-ordered contextual enforcement-target batch', async () => {
    const moderation = (await import('../src/lib/moderation')) as Record<string, unknown>;
    const parseTargets = moderation.parseModerationEnforcementTargets as
      | ((
          value: unknown,
          expected: readonly { reportId: string; supportCaseId: string; reportedUserId: string }[],
        ) => unknown)
      | undefined;
    expect(parseTargets).toBeTypeOf('function');
    if (!parseTargets) return;
    const expected = [
      {
        reportId: '11111111-1111-4111-8111-111111111111',
        supportCaseId: '22222222-2222-4222-8222-222222222222',
        reportedUserId: '55555555-5555-4555-8555-555555555555',
      },
      {
        reportId: '33333333-3333-4333-8333-333333333333',
        supportCaseId: '44444444-4444-4444-8444-444444444444',
        reportedUserId: '66666666-6666-4666-8666-666666666666',
      },
    ];
    const customer = {
      ...expected[0],
      targetRole: 'customer',
    };
    const provider = {
      ...expected[1],
      targetRole: 'provider',
    };
    expect(parseTargets({ targets: [customer, provider] }, expected)).toEqual([customer, provider]);
    expect(() => parseTargets({ targets: [customer] }, expected)).toThrow(
      'MODERATION_ENFORCEMENT_TARGETS_INVALID',
    );
    expect(() => parseTargets({ targets: [provider, customer] }, expected)).toThrow(
      'MODERATION_ENFORCEMENT_TARGETS_INVALID',
    );
    expect(() =>
      parseTargets(
        {
          targets: [
            customer,
            {
              ...provider,
              supportCaseId: '22222222-2222-4222-8222-222222222222',
            },
          ],
        },
        expected,
      ),
    ).toThrow('MODERATION_ENFORCEMENT_TARGETS_INVALID');
    expect(() =>
      parseTargets(
        {
          targets: [
            customer,
            {
              ...provider,
              reportedUserId: '77777777-7777-4777-8777-777777777777',
            },
          ],
        },
        expected,
      ),
    ).toThrow('MODERATION_ENFORCEMENT_TARGETS_INVALID');
    expect(() =>
      parseTargets({ targets: [customer, { ...provider, targetRole: 'dual' }] }, expected),
    ).toThrow('MODERATION_ENFORCEMENT_TARGETS_INVALID');
    expect(() => parseTargets({ targets: [customer, provider], evidence: [] }, expected)).toThrow(
      'MODERATION_ENFORCEMENT_TARGETS_INVALID',
    );
  });

  it('accepts only an absent or canonical linked support-case filter', async () => {
    const moderation = (await import('../src/lib/moderation')) as Record<string, unknown>;
    const parseFilter = moderation.parseSupportCaseFilter as
      ((value: unknown) => string | null) | undefined;
    expect(parseFilter).toBeTypeOf('function');
    if (!parseFilter) return;
    const caseId = '11111111-1111-4111-8111-111111111111';
    expect(parseFilter(undefined)).toBeNull();
    expect(parseFilter('')).toBeNull();
    expect(parseFilter(caseId)).toBe(caseId);
    expect(() => parseFilter('not-a-case')).toThrow('SUPPORT_CASE_FILTER_INVALID');
  });

  it('uses only typed moderation RPCs, durable fields, and target-bound enforcement handoffs', () => {
    const page = optionalSource('../app/admin/moderation/page.tsx');
    const enforcement = optionalSource('../app/admin/enforcement/customers/[reportId]/page.tsx');
    const providers = source('../app/admin/providers/page.tsx');
    const support = source('../app/admin/support/page.tsx');
    const actions = source('../app/admin/actions.ts');
    const auth = source('../src/lib/auth.ts');
    const layout = source('../app/admin/layout.tsx');

    expect(page).toContain("'list_open_marketplace_reports'");
    expect(page).toContain("'get_marketplace_report_enforcement_targets'");
    expect(page).not.toContain("'get_marketplace_report_enforcement_target'");
    expect(page).not.toContain("rpc('list_marketplace_reports'");
    expect(page).not.toContain(".from('provider_profiles')");
    expect(page).not.toContain(".from('marketplace_reports')");
    expect(page).not.toContain(".from('marketplace_report_events')");
    expect(page).toContain('DurableCommandIntent');
    expect(page).toContain('name="expectedVersion"');
    expect(page).toContain('name="reason"');
    expect(page).toContain('/admin/enforcement/customers/');
    expect(page).toContain('/admin/providers?providerId=');
    expect(page).toContain('/admin/support?caseId=');
    expect(page).toContain('enforcementTarget.reportedUserId');
    expect(page).not.toContain('href="/admin/customers"');
    expect(page).not.toContain('href="/admin/providers"');
    expect(page).not.toContain('setCustomerStatus');
    expect(page).not.toContain('reviewProvider');

    expect(enforcement).toContain("'get_marketplace_report_enforcement_target'");
    expect(enforcement).toContain('setCustomerStatus.bind');
    expect(enforcement).not.toContain("rpc('list_marketplace_reports'");
    expect(enforcement).not.toContain(".from('provider_profiles')");
    expect(enforcement).not.toContain("rpc('admin_set_customer_status'");
    expect(enforcement).not.toContain(".from('profiles')");
    expect(providers).toContain(".eq('user_id', providerId)");
    expect(support).toContain(".eq('id', caseId)");

    expect(actions).toContain("rpc('triage_marketplace_report'");
    expect(actions).toContain("rpc('resolve_marketplace_report'");
    expect(actions).toContain("formCommandKey('marketplace-report-triage'");
    expect(actions).toContain("formCommandKey('marketplace-report-resolution'");
    expect(actions).toContain("'get_marketplace_report_enforcement_target'");
    expect(actions).toContain('requireModerationActionSession');
    expect(actions).not.toContain("rpc('list_marketplace_reports'");
    expect(actions).not.toContain(".from('provider_profiles')");
    expect(actions).not.toContain(".from('marketplace_reports')");
    expect(auth).toContain('requireModerationRead');
    expect(auth).toContain('requireModerationOperations');
    expect(auth).toContain('requireModerationEscalation');
    expect(auth).toContain('requireModerationActionSession');
    expect(layout).toContain('/admin/moderation');
  });

  it('uses a portable Docker resolver and captures the exact created report in E2E', () => {
    const e2e = source('../../../tests/e2e-web/admin-moderation.spec.ts');
    expect(e2e).toContain('resolveDockerCommand');
    expect(e2e).toContain('function createReportThroughAuthenticatedCommand(): string');
    expect(e2e).toContain('aria-labelledby');
    expect(e2e).not.toContain("spawnSync(\n    'wsl.exe'");
    expect(e2e).not.toContain("hasText: 'مضايقة أو إساءة'");
  });
});
