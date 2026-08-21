import { z } from 'zod';
import type { ModerationCaseScope } from './admin-permissions';

const timestampSchema = z.iso.datetime({ offset: true });
const reportStatusSchema = z.enum(['submitted', 'triaged', 'escalated', 'resolved', 'dismissed']);
const openReportStatusSchema = z.enum(['submitted', 'triaged', 'escalated']);
const reportPrioritySchema = z.enum(['low', 'normal', 'high', 'urgent']);
const reportEventSchema = z
  .object({
    eventId: z.uuid(),
    eventType: reportStatusSchema,
    fromStatus: reportStatusSchema.nullable(),
    toStatus: reportStatusSchema,
    reason: z.string().min(1).max(2_000),
    payload: z.record(z.string(), z.unknown()),
    actorId: z.uuid(),
    createdAt: timestampSchema,
  })
  .strict();
const attachmentEvidenceSchema = z
  .object({
    attachmentId: z.uuid(),
    uploadId: z.uuid(),
    mimeType: z.string().min(1).max(200),
    sizeBytes: z.number().int().nonnegative(),
    contentSha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/iu)
      .nullable(),
  })
  .strict();
const historyMetaSchema = z
  .object({
    limit: z.literal(50),
    returned: z.number().int().min(0).max(50),
    total: z.number().int().nonnegative(),
    truncated: z.boolean(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.returned > value.total || value.truncated !== value.total > value.returned) {
      context.addIssue({ code: 'custom', message: 'Invalid bounded history metadata' });
    }
  });

const moderationReportSchema = z
  .object({
    reportId: z.uuid(),
    reporterId: z.uuid(),
    reportedUserId: z.uuid(),
    targetType: z.enum(['user', 'message', 'rating']),
    messageId: z.uuid().nullable(),
    ratingId: z.uuid().nullable(),
    conversationId: z.uuid().nullable(),
    jobId: z.uuid().nullable(),
    requestId: z.uuid().nullable(),
    supportCaseId: z.uuid(),
    reasonCategory: z.enum([
      'harassment',
      'spam',
      'scam',
      'safety',
      'inappropriate_content',
      'rating_abuse',
      'other',
    ]),
    explanation: z.string().min(1).max(1_000).nullable(),
    status: reportStatusSchema,
    priority: reportPrioritySchema,
    version: z.number().int().positive(),
    createdAt: timestampSchema,
    updatedAt: timestampSchema,
    history: z.array(reportEventSchema).max(50),
    historyMeta: historyMetaSchema,
    textSnapshot: z.string().min(1).max(2_000).nullable().optional(),
    attachmentEvidence: z.array(attachmentEvidenceSchema).optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.historyMeta.returned !== value.history.length) {
      context.addIssue({ code: 'custom', message: 'Invalid report history cardinality' });
    }
  });

const moderationCursorSchema = z
  .object({ createdAt: timestampSchema, reportId: z.uuid() })
  .strict();
const openModerationQueueSchema = z
  .object({
    reports: z.array(moderationReportSchema).max(100),
    hasMore: z.boolean(),
    nextCursor: moderationCursorSchema.nullable(),
  })
  .strict()
  .superRefine((value, context) => {
    const hasFinal = value.reports.some(
      (report) => !openReportStatusSchema.safeParse(report.status).success,
    );
    const lastReport = value.reports.at(-1);
    const cursorMatchesLast =
      lastReport !== undefined &&
      value.nextCursor?.createdAt === lastReport.createdAt &&
      value.nextCursor.reportId === lastReport.reportId;
    const uniqueReportIds = new Set(value.reports.map((report) => report.reportId));
    const reportsStrictlyIncrease = value.reports.every((report, index) => {
      const previous = value.reports[index - 1];
      if (!previous) return true;
      const previousCreatedAt = Date.parse(previous.createdAt);
      const createdAt = Date.parse(report.createdAt);
      return (
        createdAt > previousCreatedAt ||
        (createdAt === previousCreatedAt && report.reportId > previous.reportId)
      );
    });
    if (
      hasFinal ||
      uniqueReportIds.size !== value.reports.length ||
      !reportsStrictlyIncrease ||
      (value.hasMore && !cursorMatchesLast) ||
      (!value.hasMore && value.nextCursor !== null)
    ) {
      context.addIssue({ code: 'custom', message: 'Invalid open moderation page' });
    }
  });

export type ModerationReport = z.infer<typeof moderationReportSchema>;
export type OpenModerationQueue = z.infer<typeof openModerationQueueSchema>;
export type ModerationPriority = z.infer<typeof reportPrioritySchema>;

export function parseOpenModerationQueue(value: unknown): OpenModerationQueue {
  const parsed = openModerationQueueSchema.safeParse(value);
  if (!parsed.success) throw new Error('OPEN_MODERATION_QUEUE_INVALID');
  return parsed.data;
}

const moderationPageCursorSearchSchema = z
  .object({
    afterCreatedAt: timestampSchema.optional(),
    afterReportId: z.uuid().optional(),
  })
  .passthrough();

export interface ModerationPageCursor {
  afterCreatedAt: string | null;
  afterReportId: string | null;
}

export function parseModerationPageCursor(value: unknown): ModerationPageCursor {
  const parsed = moderationPageCursorSearchSchema.safeParse(value);
  if (
    !parsed.success ||
    (parsed.data.afterCreatedAt === undefined) !== (parsed.data.afterReportId === undefined)
  ) {
    throw new Error('MODERATION_PAGE_CURSOR_INVALID');
  }
  return {
    afterCreatedAt: parsed.data.afterCreatedAt ?? null,
    afterReportId: parsed.data.afterReportId ?? null,
  };
}

const moderationCommandSchema = z.discriminatedUnion('action', [
  z
    .object({
      action: z.literal('triage'),
      reportId: z.uuid(),
      expectedVersion: z.coerce.number().int().positive(),
      commandIntentId: z.uuid(),
      reason: z.string().trim().min(5).max(2_000),
      priority: reportPrioritySchema,
    })
    .strict(),
  z
    .object({
      action: z.enum(['escalated', 'dismissed', 'resolved']),
      reportId: z.uuid(),
      expectedVersion: z.coerce.number().int().positive(),
      commandIntentId: z.uuid(),
      reason: z.string().trim().min(5).max(2_000),
    })
    .strict(),
]);

export type ModerationCommand = z.infer<typeof moderationCommandSchema>;

export function parseModerationCommand(value: unknown): ModerationCommand {
  const parsed = moderationCommandSchema.safeParse(value);
  if (!parsed.success) throw new Error('MODERATION_COMMAND_INVALID');
  return parsed.data;
}

export type ModerationErrorCategory =
  'validation' | 'conflict' | 'permission' | 'not_found' | 'state' | 'unavailable';

export function moderationErrorCategory(error: unknown): ModerationErrorCategory {
  const shaped = z
    .object({ code: z.string().optional(), message: z.string().optional() })
    .passthrough()
    .safeParse(error);
  if (!shaped.success) return 'unavailable';
  const code = shaped.data.code ?? '';
  const message = shaped.data.message ?? '';
  if (code === '42501' || /AUTH_REQUIRED|MODERATION_PERMISSION_REQUIRED/u.test(message)) {
    return 'permission';
  }
  if (/VERSION_CONFLICT|IDEMPOTENCY_KEY_CONFLICT|COMMAND_IN_PROGRESS/u.test(message)) {
    return 'conflict';
  }
  if (
    /REPORT_NOT_FOUND|REPORT_ENFORCEMENT_TARGET_NOT_AVAILABLE|CUSTOMER_NOT_FOUND/u.test(message)
  ) {
    return 'not_found';
  }
  if (
    /REPORT_STATE_CONFLICT|REPORT_NO_CHANGE|CUSTOMER_STATUS_LOCKED|STATUS_UNCHANGED/u.test(message)
  ) {
    return 'state';
  }
  if (/OPERATIONS_PERMISSION_REQUIRED/u.test(message)) return 'permission';
  if (/INVALID_|REASON_REQUIRED|EXPECTED_VERSION_REQUIRED/u.test(message)) return 'validation';
  return 'unavailable';
}

const supportCapabilitySchema = z.enum(['read', 'internal_note', 'evidence', 'exact_location']);
const assignmentSchema = z
  .object({
    id: z.uuid(),
    case_id: z.uuid(),
    assignee_id: z.uuid(),
    permissions: z.array(supportCapabilitySchema),
    assigned_at: timestampSchema,
    expires_at: timestampSchema.nullable(),
    ended_at: timestampSchema.nullable(),
  })
  .strict();
const delegationSchema = z
  .object({
    id: z.uuid(),
    case_id: z.uuid(),
    user_id: z.uuid(),
    permissions: z.array(supportCapabilitySchema),
    starts_at: timestampSchema,
    expires_at: timestampSchema,
    revoked_at: timestampSchema.nullable(),
  })
  .strict();

export type ModerationAccessState = 'active' | 'scheduled' | 'expired' | 'ended' | 'revoked';

export interface ModerationCaseAccessEntry {
  id: string;
  caseId: string;
  principalId: string;
  kind: 'assignment' | 'delegation';
  state: ModerationAccessState;
  permissions: readonly z.infer<typeof supportCapabilitySchema>[];
}

export function parseModerationCaseAccess(
  assignments: readonly unknown[],
  delegations: readonly unknown[],
  now: Date,
): ModerationCaseAccessEntry[] {
  const parsedAssignments = z.array(assignmentSchema).safeParse(assignments);
  const parsedDelegations = z.array(delegationSchema).safeParse(delegations);
  if (!parsedAssignments.success || !parsedDelegations.success || Number.isNaN(now.getTime())) {
    throw new Error('MODERATION_CASE_ACCESS_INVALID');
  }
  const timestamp = now.getTime();
  return [
    ...parsedAssignments.data.map((assignment): ModerationCaseAccessEntry => ({
      id: assignment.id,
      caseId: assignment.case_id,
      principalId: assignment.assignee_id,
      kind: 'assignment',
      state:
        assignment.ended_at !== null
          ? 'ended'
          : assignment.expires_at !== null && Date.parse(assignment.expires_at) <= timestamp
            ? 'expired'
            : 'active',
      permissions: assignment.permissions,
    })),
    ...parsedDelegations.data.map((delegation): ModerationCaseAccessEntry => ({
      id: delegation.id,
      caseId: delegation.case_id,
      principalId: delegation.user_id,
      kind: 'delegation',
      state:
        delegation.revoked_at !== null
          ? 'revoked'
          : Date.parse(delegation.starts_at) > timestamp
            ? 'scheduled'
            : Date.parse(delegation.expires_at) <= timestamp
              ? 'expired'
              : 'active',
      permissions: delegation.permissions,
    })),
  ];
}

export function moderationCaseReviewFor(
  caseId: string,
  access: readonly ModerationCaseAccessEntry[],
  principalId: string | null,
): { entries: ModerationCaseAccessEntry[]; scope: ModerationCaseScope | null } {
  const entries = access.filter((entry) => entry.caseId === caseId);
  if (principalId === null) return { entries, scope: null };
  if (!z.uuid().safeParse(principalId).success) {
    throw new Error('MODERATION_CASE_PRINCIPAL_INVALID');
  }
  const active = entries.filter(
    (entry) => entry.principalId === principalId && entry.state === 'active',
  );
  if (active.length === 0) return { entries, scope: null };
  const permissions = new Set(active.flatMap((entry) => entry.permissions));
  return {
    entries,
    scope: {
      kind: active.some((entry) => entry.kind === 'assignment') ? 'assignment' : 'delegation',
      permissions: supportCapabilitySchema.options.filter((permission) =>
        permissions.has(permission),
      ),
    },
  };
}

const enforcementTargetSchema = z
  .object({
    reportId: z.uuid(),
    supportCaseId: z.uuid(),
    reportedUserId: z.uuid(),
    targetRole: z.enum(['customer', 'provider']),
  })
  .strict();

export type ModerationEnforcementTarget = z.infer<typeof enforcementTargetSchema>;

export function parseModerationEnforcementTarget(value: unknown): ModerationEnforcementTarget {
  const parsed = enforcementTargetSchema.safeParse(value);
  if (!parsed.success) throw new Error('MODERATION_ENFORCEMENT_TARGET_INVALID');
  return parsed.data;
}

const expectedEnforcementTargetSchema = z
  .object({ reportId: z.uuid(), supportCaseId: z.uuid(), reportedUserId: z.uuid() })
  .strict();
const enforcementTargetBatchSchema = z
  .object({ targets: z.array(enforcementTargetSchema).min(1).max(100) })
  .strict();

export function parseModerationEnforcementTargets(
  value: unknown,
  expected: readonly { reportId: string; supportCaseId: string; reportedUserId: string }[],
): ModerationEnforcementTarget[] {
  const parsedExpected = z
    .array(expectedEnforcementTargetSchema)
    .min(1)
    .max(100)
    .safeParse(expected);
  const parsed = enforcementTargetBatchSchema.safeParse(value);
  if (
    !parsedExpected.success ||
    !parsed.success ||
    new Set(parsedExpected.data.map((item) => item.reportId)).size !== parsedExpected.data.length ||
    parsed.data.targets.length !== parsedExpected.data.length ||
    parsed.data.targets.some((target, index) => {
      const expectedTarget = parsedExpected.data[index];
      return (
        !expectedTarget ||
        target.reportId !== expectedTarget.reportId ||
        target.supportCaseId !== expectedTarget.supportCaseId ||
        target.reportedUserId !== expectedTarget.reportedUserId
      );
    })
  ) {
    throw new Error('MODERATION_ENFORCEMENT_TARGETS_INVALID');
  }
  return parsed.data.targets;
}

export function parseConfirmedIntentId(value: unknown): string | null {
  const parsed = z.uuid().safeParse(value);
  return parsed.success ? parsed.data : null;
}

export function parseSupportCaseFilter(value: unknown): string | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = z.uuid().safeParse(value);
  if (!parsed.success) throw new Error('SUPPORT_CASE_FILTER_INVALID');
  return parsed.data;
}
