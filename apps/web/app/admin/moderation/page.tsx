import Link from 'next/link';
import { formatStatusLabel, translate, type TranslationKey } from '@sallah/i18n';
import { ConfirmedCommandIntentConsumer } from '@/components/confirmed-command-intent-consumer';
import { DurableCommandIntent } from '@/components/durable-command-intent';
import { moderationCapabilitiesForCase } from '@/lib/admin-permissions';
import { requireModerationRead } from '@/lib/auth';
import {
  moderationCaseReviewFor,
  parseConfirmedIntentId,
  parseModerationCaseAccess,
  parseModerationEnforcementTargets,
  parseModerationPageCursor,
  parseOpenModerationQueue,
  type ModerationAccessState,
  type ModerationCaseAccessEntry,
  type ModerationEnforcementTarget,
  type ModerationPriority,
} from '@/lib/moderation';
import {
  dismissMarketplaceReport,
  escalateMarketplaceReport,
  resolveMarketplaceReportAction,
  triageMarketplaceReport,
} from '../actions';

const t = (key: TranslationKey, variables: Readonly<Record<string, string | number>> = {}) =>
  translate('ar', key, variables);

const priorityLabels: Readonly<Record<ModerationPriority, TranslationKey>> = {
  low: 'adminModerationPriorityLow',
  normal: 'adminModerationPriorityNormal',
  high: 'adminModerationPriorityHigh',
  urgent: 'adminModerationPriorityUrgent',
};
const targetLabels = {
  user: 'trustReportUser',
  message: 'trustReportMessage',
  rating: 'trustReportRating',
} as const satisfies Readonly<Record<string, TranslationKey>>;
const reasonLabels = {
  harassment: 'trustReasonHarassment',
  spam: 'trustReasonSpam',
  scam: 'trustReasonScam',
  safety: 'trustReasonSafety',
  inappropriate_content: 'trustReasonInappropriateContent',
  rating_abuse: 'trustReasonRatingAbuse',
  other: 'trustReasonOther',
} as const satisfies Readonly<Record<string, TranslationKey>>;
const noticeLabels = {
  triaged: 'adminModerationSuccessTriaged',
  escalated: 'adminModerationSuccessEscalated',
  dismissed: 'adminModerationSuccessDismissed',
  resolved: 'adminModerationSuccessResolved',
} as const satisfies Readonly<Record<string, TranslationKey>>;
const errorLabels = {
  validation: 'adminModerationErrorValidation',
  conflict: 'adminModerationErrorConflict',
  permission: 'adminModerationErrorPermission',
  not_found: 'adminModerationErrorNotFound',
  state: 'adminModerationErrorState',
  unavailable: 'adminModerationErrorUnavailable',
} as const satisfies Readonly<Record<string, TranslationKey>>;
const accessStateLabels: Readonly<Record<ModerationAccessState, TranslationKey>> = {
  active: 'adminModerationAccessActive',
  expired: 'adminModerationAccessExpired',
  ended: 'adminModerationAccessEnded',
  scheduled: 'adminModerationAccessScheduled',
  revoked: 'adminModerationAccessRevoked',
};
const accessKindLabels = {
  assignment: 'adminModerationAssignment',
  delegation: 'adminModerationDelegation',
} as const satisfies Readonly<Record<ModerationCaseAccessEntry['kind'], TranslationKey>>;
const permissionLabels = {
  read: 'adminModerationPermissionRead',
  evidence: 'adminModerationPermissionEvidence',
  internal_note: 'adminModerationPermissionInternalNote',
  exact_location: 'adminModerationPermissionExactLocation',
} as const satisfies Readonly<
  Record<ModerationCaseAccessEntry['permissions'][number], TranslationKey>
>;

function selectedLabel<T extends Readonly<Record<string, TranslationKey>>>(
  labels: T,
  value: string | undefined,
): TranslationKey | null {
  if (!value || !Object.hasOwn(labels, value)) return null;
  return labels[value as keyof T] ?? null;
}

export default async function ModerationPage({
  searchParams,
}: {
  searchParams: Promise<{
    notice?: string | string[];
    error?: string | string[];
    confirmedIntentId?: string | string[];
    afterCreatedAt?: string | string[];
    afterReportId?: string | string[];
  }>;
}) {
  const { client, user, roles, permissions } = await requireModerationRead();
  const query = await searchParams;
  let cursor: ReturnType<typeof parseModerationPageCursor> = {
    afterCreatedAt: null,
    afterReportId: null,
  };
  let loadFailed = false;
  try {
    cursor = parseModerationPageCursor(query);
  } catch {
    loadFailed = true;
  }
  let queue: ReturnType<typeof parseOpenModerationQueue> = {
    reports: [],
    hasMore: false,
    nextCursor: null,
  };
  if (!loadFailed) {
    const response = await client.rpc(
      'list_open_marketplace_reports',
      cursor.afterCreatedAt && cursor.afterReportId
        ? {
            p_limit: 100,
            p_after_created_at: cursor.afterCreatedAt,
            p_after_report_id: cursor.afterReportId,
          }
        : { p_limit: 100 },
    );
    if (response.error) {
      loadFailed = true;
    } else {
      try {
        queue = parseOpenModerationQueue(response.data);
      } catch {
        loadFailed = true;
      }
    }
  }
  const reports = queue.reports;

  const operationsScope = permissions.has('operations.marketplace.read');
  const supportScope = roles.includes('support_agent') && !operationsScope;
  const caseIds = [...new Set(reports.map((report) => report.supportCaseId))];
  let caseAccess: readonly ModerationCaseAccessEntry[] = [];
  if (caseIds.length > 0) {
    const [assignmentResponse, delegationResponse] = await Promise.all([
      supportScope
        ? client
            .from('support_case_assignments')
            .select('id,case_id,assignee_id,permissions,assigned_at,expires_at,ended_at')
            .eq('assignee_id', user.id)
            .in('case_id', caseIds)
        : client
            .from('support_case_assignments')
            .select('id,case_id,assignee_id,permissions,assigned_at,expires_at,ended_at')
            .in('case_id', caseIds),
      supportScope
        ? client
            .from('support_case_access_grants')
            .select('id,case_id,user_id,permissions,starts_at,expires_at,revoked_at')
            .eq('user_id', user.id)
            .in('case_id', caseIds)
        : client
            .from('support_case_access_grants')
            .select('id,case_id,user_id,permissions,starts_at,expires_at,revoked_at')
            .in('case_id', caseIds),
    ]);
    if (assignmentResponse.error || delegationResponse.error) {
      loadFailed = true;
    } else {
      try {
        caseAccess = parseModerationCaseAccess(
          assignmentResponse.data,
          delegationResponse.data,
          new Date(),
        );
      } catch {
        loadFailed = true;
      }
    }
  }

  const canResolveEnforcementTarget =
    operationsScope && permissions.has('operations.mutate') && reports.length > 0;
  const enforcementTargets = new Map<string, ModerationEnforcementTarget>();
  let enforcementTargetsLoadFailed = false;
  if (canResolveEnforcementTarget) {
    try {
      const response = await client.rpc('get_marketplace_report_enforcement_targets', {
        p_report_ids: reports.map((report) => report.reportId),
      });
      if (response.error) throw new Error('MODERATION_ENFORCEMENT_TARGETS_UNAVAILABLE');
      const targets = parseModerationEnforcementTargets(
        response.data,
        reports.map((report) => ({
          reportId: report.reportId,
          supportCaseId: report.supportCaseId,
          reportedUserId: report.reportedUserId,
        })),
      );
      for (const target of targets) {
        enforcementTargets.set(target.reportId, target);
      }
    } catch {
      enforcementTargets.clear();
      enforcementTargetsLoadFailed = true;
    }
  }

  const visibleReports = reports
    .map((report) => {
      const caseReview = moderationCaseReviewFor(
        report.supportCaseId,
        caseAccess,
        operationsScope ? null : user.id,
      );
      return {
        report,
        caseReview,
        enforcementTarget: enforcementTargets.get(report.reportId) ?? null,
        capabilities: moderationCapabilitiesForCase(
          permissions,
          operationsScope ? null : caseReview.scope,
        ),
      };
    })
    .filter((item) => item.capabilities.canRead && !loadFailed);
  const notice = typeof query.notice === 'string' ? query.notice : undefined;
  const noticeKey = selectedLabel(noticeLabels, notice);
  const errorKey = selectedLabel(
    errorLabels,
    typeof query.error === 'string' ? query.error : undefined,
  );
  const confirmedIntentId =
    noticeKey && !errorKey ? parseConfirmedIntentId(query.confirmedIntentId) : null;
  const nextHref =
    queue.hasMore && queue.nextCursor
      ? `/admin/moderation?${new URLSearchParams({
          afterCreatedAt: queue.nextCursor.createdAt,
          afterReportId: queue.nextCursor.reportId,
        }).toString()}`
      : null;

  return (
    <main id="main" className="shell section">
      <ConfirmedCommandIntentConsumer confirmedIntentId={confirmedIntentId} />
      <h1 tabIndex={-1}>{t('adminModerationTitle')}</h1>
      <p>{t('adminModerationLead')}</p>
      {noticeKey && (
        <p role="status" aria-live="polite" className="notice" tabIndex={-1}>
          {t(noticeKey)}
        </p>
      )}
      {errorKey && (
        <p role="alert" className="error" tabIndex={-1}>
          {t(errorKey)}
        </p>
      )}
      {loadFailed && (
        <p role="alert" className="error">
          {t('adminModerationQueueLoadFailed')}
        </p>
      )}
      {enforcementTargetsLoadFailed && (
        <p role="alert" className="error">
          {t('adminModerationEnforcementTargetsUnavailable')}
        </p>
      )}

      <div className="grid">
        {visibleReports.map(({ report, capabilities, caseReview, enforcementTarget }) => {
          const finalState = report.status === 'resolved' || report.status === 'dismissed';
          const scopeLabel =
            capabilities.scope === 'operations'
              ? 'adminModerationOperationsScope'
              : capabilities.scope === 'assignment'
                ? 'adminModerationAssignedScope'
                : 'adminModerationDelegatedScope';
          const headingId = `moderation-report-${report.reportId}`;
          const hasEvidence =
            capabilities.canReadEvidence &&
            (report.textSnapshot !== undefined || report.attachmentEvidence !== undefined);
          return (
            <article className="card" key={report.reportId} aria-labelledby={headingId}>
              <h2 id={headingId}>{t(targetLabels[report.targetType])}</h2>
              <p>
                <span className="badge">{formatStatusLabel(report.status, 'ar')}</span>{' '}
                <span className="badge">{t(priorityLabels[report.priority])}</span>{' '}
                <span className="badge">{t(scopeLabel)}</span>
              </p>
              <p>
                <strong>{t('trustReasonLabel')}:</strong> {t(reasonLabels[report.reasonCategory])}
              </p>
              {report.explanation && <p>{report.explanation}</p>}
              <p className="muted">
                <time dateTime={report.createdAt}>
                  {new Date(report.createdAt).toLocaleString('ar-SA', {
                    timeZone: 'Asia/Riyadh',
                  })}
                </time>
              </p>

              <details>
                <summary>{t('adminModerationEvidence')}</summary>
                {hasEvidence ? (
                  <>
                    {report.textSnapshot && <blockquote>{report.textSnapshot}</blockquote>}
                    <ul>
                      {report.attachmentEvidence?.map((attachment) => (
                        <li key={attachment.attachmentId}>
                          {attachment.mimeType} · {attachment.sizeBytes} B · SHA-256{' '}
                          {attachment.contentSha256?.slice(0, 12) ?? '—'}…
                        </li>
                      ))}
                    </ul>
                  </>
                ) : (
                  <p>{t('adminModerationEvidenceUnavailable')}</p>
                )}
              </details>

              <details>
                <summary>{t('adminModerationHistory')}</summary>
                {report.historyMeta.truncated && (
                  <p>
                    {t('adminModerationHistoryTruncated', { count: report.historyMeta.returned })}
                  </p>
                )}
                <ol>
                  {report.history.map((event) => (
                    <li key={event.eventId}>
                      <strong>{formatStatusLabel(event.toStatus, 'ar')}</strong> — {event.reason}{' '}
                      <time dateTime={event.createdAt}>
                        {new Date(event.createdAt).toLocaleString('ar-SA', {
                          timeZone: 'Asia/Riyadh',
                        })}
                      </time>
                    </li>
                  ))}
                </ol>
              </details>

              <section aria-label={t('adminModerationCaseReviewTitle')}>
                <h3>{t('adminModerationCaseReviewTitle')}</h3>
                <p>
                  <strong>{t('adminModerationCaseId')}:</strong> {report.supportCaseId}
                </p>
                {caseReview.entries.length > 0 ? (
                  <ul>
                    {caseReview.entries.map((entry) => (
                      <li key={`${entry.kind}:${entry.id}`}>
                        {t(accessKindLabels[entry.kind])} · {t(accessStateLabels[entry.state])} ·{' '}
                        {entry.permissions
                          .map((permission) => t(permissionLabels[permission]))
                          .join('، ')}
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p>{t('adminModerationNoCaseAccess')}</p>
                )}
                <Link
                  className="button secondary"
                  href={`/admin/support?caseId=${report.supportCaseId}`}
                >
                  {t('adminModerationOpenSupportCase')}
                </Link>
              </section>

              {capabilities.scope === 'operations' && (
                <div className="notice">
                  <p>{t('adminModerationSuspensionSeparation')}</p>
                  <div className="actions">
                    {capabilities.canOpenCustomerEnforcement &&
                      enforcementTarget?.targetRole === 'customer' && (
                        <Link
                          className="button secondary"
                          href={`/admin/enforcement/customers/${report.reportId}`}
                        >
                          {t('adminModerationLinkCustomer')}
                        </Link>
                      )}
                    {capabilities.canOpenProviderEnforcement &&
                      enforcementTarget?.targetRole === 'provider' && (
                        <Link
                          className="button secondary"
                          href={`/admin/providers?providerId=${enforcementTarget.reportedUserId}`}
                        >
                          {t('adminModerationLinkProvider')}
                        </Link>
                      )}
                  </div>
                </div>
              )}

              {capabilities.canTriage && !finalState && (
                <form action={triageMarketplaceReport} className="inline-form">
                  <DurableCommandIntent
                    intentKey={`marketplace-report-triage:${report.reportId}`}
                    initialIntentId={crypto.randomUUID()}
                    confirmedIntentId={notice === 'triaged' ? confirmedIntentId : null}
                  />
                  <input type="hidden" name="reportId" value={report.reportId} />
                  <input type="hidden" name="expectedVersion" value={report.version} />
                  <label>
                    {t('priority')}
                    <select name="priority" defaultValue={report.priority}>
                      {(Object.keys(priorityLabels) as ModerationPriority[]).map((priority) => (
                        <option key={priority} value={priority}>
                          {t(priorityLabels[priority])}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t('adminModerationReason')}
                    <input name="reason" minLength={5} maxLength={2000} required />
                  </label>
                  <button type="submit">{t('adminModerationTriage')}</button>
                </form>
              )}

              {capabilities.canEscalate && !finalState && report.status !== 'escalated' && (
                <form action={escalateMarketplaceReport} className="inline-form">
                  <DurableCommandIntent
                    intentKey={`marketplace-report-escalate:${report.reportId}`}
                    initialIntentId={crypto.randomUUID()}
                    confirmedIntentId={notice === 'escalated' ? confirmedIntentId : null}
                  />
                  <input type="hidden" name="reportId" value={report.reportId} />
                  <input type="hidden" name="expectedVersion" value={report.version} />
                  <label>
                    {t('adminModerationReason')}
                    <input name="reason" minLength={5} maxLength={2000} required />
                  </label>
                  <button type="submit">{t('adminModerationEscalate')}</button>
                </form>
              )}

              {capabilities.canDismiss && !finalState && (
                <form action={dismissMarketplaceReport} className="inline-form">
                  <DurableCommandIntent
                    intentKey={`marketplace-report-dismiss:${report.reportId}`}
                    initialIntentId={crypto.randomUUID()}
                    confirmedIntentId={notice === 'dismissed' ? confirmedIntentId : null}
                  />
                  <input type="hidden" name="reportId" value={report.reportId} />
                  <input type="hidden" name="expectedVersion" value={report.version} />
                  <label>
                    {t('adminModerationReason')}
                    <input name="reason" minLength={5} maxLength={2000} required />
                  </label>
                  <button type="submit" className="danger-button">
                    {t('adminModerationDismiss')}
                  </button>
                </form>
              )}

              {capabilities.canResolve && !finalState && (
                <form action={resolveMarketplaceReportAction} className="inline-form">
                  <DurableCommandIntent
                    intentKey={`marketplace-report-resolve:${report.reportId}`}
                    initialIntentId={crypto.randomUUID()}
                    confirmedIntentId={notice === 'resolved' ? confirmedIntentId : null}
                  />
                  <input type="hidden" name="reportId" value={report.reportId} />
                  <input type="hidden" name="expectedVersion" value={report.version} />
                  <label>
                    {t('adminModerationReason')}
                    <input name="reason" minLength={5} maxLength={2000} required />
                  </label>
                  <button type="submit">{t('adminModerationResolve')}</button>
                </form>
              )}
            </article>
          );
        })}
      </div>
      {!loadFailed && visibleReports.length === 0 && <p>{t('adminModerationEmpty')}</p>}
      {!loadFailed && (
        <nav className="actions" aria-label={t('adminModerationTitle')}>
          {cursor.afterReportId && (
            <Link className="button secondary" href="/admin/moderation">
              {t('adminModerationFirstPage')}
            </Link>
          )}
          {nextHref && (
            <Link className="button secondary" href={nextHref}>
              {t('adminModerationNextPage')}
            </Link>
          )}
        </nav>
      )}
    </main>
  );
}
