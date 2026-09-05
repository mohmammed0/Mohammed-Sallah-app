import { formatStatusLabel, translate } from '@sallah/i18n';
import { z } from 'zod';
import { DurableCommandIntent } from '@/components/durable-command-intent';
import { requireAnyAdmin } from '@/lib/auth';
import { parseSupportCaseFilter } from '@/lib/moderation';
import {
  assignSupportCase,
  decideCancellation,
  endSupportAssignment,
  grantSupportAccess,
  resolveDispute,
  revokeSupportAccess,
  sendSupportCaseMessage,
} from '../actions';

const t = (key: Parameters<typeof translate>[1]) => translate('ar', key);

const invalidCaseId = '00000000-0000-4000-8000-000000000000';
const supportMessageSchema = z
  .object({
    id: z.uuid(),
    case_id: z.uuid(),
    body: z.string().min(1).max(4000),
    visible_to_user: z.literal(true),
    created_at: z.string().datetime({ offset: true }),
  })
  .strict();
const supportMessageListSchema = z.array(supportMessageSchema).max(50);

export default async function SupportPage({
  searchParams,
}: {
  searchParams: Promise<{
    caseId?: string | string[];
    notice?: string | string[];
    error?: string | string[];
    confirmedIntentId?: string | string[];
  }>;
}) {
  const { client, roles } = await requireAnyAdmin([
    'support.case.read',
    'operations.marketplace.read',
  ]);
  const canFinance = roles.some((role) => role === 'finance_reviewer' || role === 'super_admin');
  const canOperate = roles.some((role) => role === 'operations_admin' || role === 'super_admin');
  const query = await searchParams;
  const error = typeof query.error === 'string' ? query.error : null;
  const notice = typeof query.notice === 'string' ? query.notice : null;
  const replyError = error === 'validation' || error === 'unavailable';
  const replySent = notice === 'message_sent';
  const rawConfirmedIntentId =
    typeof query.confirmedIntentId === 'string' ? query.confirmedIntentId : null;
  const confirmedIntentId =
    replySent && !replyError ? (z.uuid().safeParse(rawConfirmedIntentId).data ?? null) : null;
  let caseId: string | null;
  let invalidCaseFilter = false;
  try {
    caseId = parseSupportCaseFilter(query.caseId);
  } catch {
    caseId = invalidCaseId;
    invalidCaseFilter = true;
  }
  const casesQuery = client
    .from('support_cases')
    .select(
      'id,subject,topic,priority,status,opened_by,created_at,updated_at,support_case_assignments(id,assignee_id,assigned_at,expires_at,permissions,ended_at),support_case_access_grants(id,user_id,permissions,expires_at,revoked_at)',
    );
  const [cases, cancellations, disputes, messages] = await (caseId
    ? Promise.all([
        casesQuery.eq('id', caseId).order('updated_at', { ascending: false }).limit(1),
        Promise.resolve({ data: [], error: null }),
        Promise.resolve({ data: [], error: null }),
        client
          .from('support_case_messages')
          .select('id,case_id,body,visible_to_user,created_at')
          .eq('case_id', caseId)
          .eq('visible_to_user', true)
          .order('created_at', { ascending: false })
          .order('id', { ascending: false })
          .limit(50),
      ])
    : Promise.all([
        casesQuery.order('updated_at', { ascending: false }).limit(100),
        client
          .from('cancellation_requests')
          .select('id,job_id,reason,status,created_at,jobs(version,status)')
          .eq('status', 'pending')
          .order('created_at', { ascending: true })
          .limit(100),
        client
          .from('disputes')
          .select('id,job_id,reason,priority,status,created_at,jobs(version,status)')
          .not('status', 'in', '(resolved,closed)')
          .order('created_at', { ascending: true })
          .limit(100),
        Promise.resolve({ data: [], error: null }),
      ]));
  let visibleMessages: z.infer<typeof supportMessageListSchema> = [];
  let messagesInvalid = false;
  if (!messages.error) {
    const parsed = supportMessageListSchema.safeParse(messages.data ?? []);
    if (parsed.success && (!caseId || parsed.data.every((message) => message.case_id === caseId))) {
      visibleMessages = parsed.data.slice().reverse();
    } else {
      messagesInvalid = true;
    }
  }
  const hasError =
    invalidCaseFilter ||
    cases.error ||
    cancellations.error ||
    disputes.error ||
    messages.error ||
    messagesInvalid;
  const selectedCase = caseId ? cases.data?.[0] : null;
  const selectedCaseIsFinal =
    selectedCase?.status === 'resolved' || selectedCase?.status === 'closed';

  return (
    <main id="main" className="shell section">
      <h1>{t('adminSupportTitle')}</h1>
      <div className="notice">{t('humanDecisionNotice')}</div>
      {hasError && <p className="error">{t('adminQueueLoadFailed')}</p>}
      {replyError && (
        <p role="alert" className="error">
          {t('supportReplyFailed')}
        </p>
      )}
      {replySent && !replyError && (
        <p role="status" aria-live="polite" className="notice">
          {formatStatusLabel('sent', 'ar')}
        </p>
      )}

      <h2>{t('supportCases')}</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('subject')}</th>
              <th>{t('priority')}</th>
              <th>{t('status')}</th>
              <th>{t('updatedAt')}</th>
            </tr>
          </thead>
          <tbody>
            {cases.data?.map((item) => (
              <tr key={item.id}>
                <td>
                  <p>{item.subject}</p>
                  {!caseId && <a href={`/admin/support?caseId=${item.id}`}>{t('messages')}</a>}
                  {item.support_case_assignments
                    .filter((assignment) => !assignment.ended_at)
                    .map((assignment) => (
                      <form
                        action={endSupportAssignment}
                        className="inline-form"
                        key={assignment.id}
                      >
                        <DurableCommandIntent
                          intentKey={`support-assignment-end:${assignment.id}`}
                          initialIntentId={crypto.randomUUID()}
                        />
                        <input type="hidden" name="assignmentId" value={assignment.id} />
                        <span className="muted">
                          {t('supportAgentId')}: {assignment.assignee_id}
                        </span>
                        <input
                          name="reason"
                          minLength={5}
                          maxLength={1000}
                          required
                          placeholder={t('decisionReason')}
                        />
                        {canOperate && <button type="submit">{t('endAssignment')}</button>}
                      </form>
                    ))}
                  {item.support_case_access_grants
                    .filter((grant) => !grant.revoked_at)
                    .map((grant) => (
                      <form action={revokeSupportAccess} className="inline-form" key={grant.id}>
                        <DurableCommandIntent
                          intentKey={`support-access-revoke:${grant.id}`}
                          initialIntentId={crypto.randomUUID()}
                        />
                        <input type="hidden" name="grantId" value={grant.id} />
                        <span className="muted">
                          {t('supportAgentId')}: {grant.user_id}
                        </span>
                        <input
                          name="reason"
                          minLength={5}
                          maxLength={1000}
                          required
                          placeholder={t('decisionReason')}
                        />
                        {canOperate && <button type="submit">{t('revokeAccess')}</button>}
                      </form>
                    ))}
                  {canOperate && (
                    <>
                      <form action={assignSupportCase} className="inline-form">
                        <DurableCommandIntent
                          intentKey={`support-assignment:${item.id}`}
                          initialIntentId={crypto.randomUUID()}
                          defaultExpiresAt={new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString()}
                        />
                        <input type="hidden" name="caseId" value={item.id} />
                        <input name="assigneeId" required placeholder={t('supportAgentId')} />
                        <input name="expiresAt" placeholder={t('accessExpiry')} />
                        <label>
                          {t('exactLocationAccess')}
                          <select name="exactLocation" defaultValue="false">
                            <option value="false">{t('no')}</option>
                            <option value="true">{t('yes')}</option>
                          </select>
                        </label>
                        <input
                          name="reason"
                          minLength={5}
                          maxLength={1000}
                          required
                          placeholder={t('decisionReason')}
                        />
                        <button type="submit">{t('assignSupportCase')}</button>
                      </form>
                      <form action={grantSupportAccess} className="inline-form">
                        <DurableCommandIntent
                          intentKey={`support-access-grant:${item.id}`}
                          initialIntentId={crypto.randomUUID()}
                        />
                        <input type="hidden" name="caseId" value={item.id} />
                        <input name="userId" required placeholder={t('supportAgentId')} />
                        <input name="expiresAt" required placeholder={t('accessExpiry')} />
                        <label>
                          {t('exactLocationAccess')}
                          <select name="exactLocation" defaultValue="false">
                            <option value="false">{t('no')}</option>
                            <option value="true">{t('yes')}</option>
                          </select>
                        </label>
                        <input
                          name="reason"
                          minLength={5}
                          maxLength={1000}
                          required
                          placeholder={t('decisionReason')}
                        />
                        <button type="submit">{t('grantTemporaryAccess')}</button>
                      </form>
                    </>
                  )}
                </td>
                <td>{item.priority}</td>
                <td>
                  <span className="badge">{item.status}</span>
                </td>
                <td>{new Date(item.updated_at).toLocaleString('ar-SA')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {caseId && selectedCase && !messages.error && !messagesInvalid && (
        <section aria-labelledby="support-conversation-title" className="section">
          <h2 id="support-conversation-title">{t('messages')}</h2>
          <div className="grid">
            {visibleMessages.map((message) => (
              <article className="card" key={message.id}>
                <p>{message.body}</p>
                <p className="muted">{new Date(message.created_at).toLocaleString('ar-SA')}</p>
              </article>
            ))}
          </div>
          {visibleMessages.length === 0 && <p className="muted">{t('noMessages')}</p>}
          {!selectedCaseIsFinal && (
            <form action={sendSupportCaseMessage} className="inline-form">
              <DurableCommandIntent
                intentKey={`support-message:${selectedCase.id}`}
                initialIntentId={crypto.randomUUID()}
                confirmedIntentId={confirmedIntentId}
              />
              <input type="hidden" name="caseId" value={selectedCase.id} />
              <label>
                {t('messagePlaceholder')}
                <textarea
                  name="body"
                  minLength={1}
                  maxLength={4000}
                  required
                  placeholder={t('messagePlaceholder')}
                />
              </label>
              <button type="submit">{t('send')}</button>
            </form>
          )}
        </section>
      )}

      {!caseId && (
        <>
          <h2>{t('cancellations')}</h2>
          <div className="grid">
            {cancellations.data?.map((item) => (
              <article className="card" key={item.id}>
                <span className="badge">{item.status}</span>
                <p>{item.reason}</p>
                <p className="muted">
                  {t('jobVersion')}: {item.jobs?.version ?? '—'} · {item.jobs?.status ?? '—'}
                </p>
                {item.job_id && item.jobs && (
                  <form action={decideCancellation} className="inline-form">
                    <DurableCommandIntent
                      intentKey={`cancellation-decision:${item.id}`}
                      initialIntentId={crypto.randomUUID()}
                    />
                    <input type="hidden" name="cancellationId" value={item.id} />
                    <input type="hidden" name="expectedJobVersion" value={item.jobs.version} />
                    <label>
                      {t('decisionReason')}
                      <input name="reason" minLength={5} maxLength={1000} required />
                    </label>
                    {canFinance ? (
                      <label>
                        {t('cancellationFeeMinor')}
                        <input
                          name="feeMinor"
                          type="number"
                          min="0"
                          step="1"
                          defaultValue="0"
                          required
                        />
                      </label>
                    ) : (
                      <input type="hidden" name="feeMinor" value="0" />
                    )}
                    <button type="submit" name="approve" value="true">
                      {t('approveCancellation')}
                    </button>
                    <button type="submit" name="approve" value="false" className="danger-button">
                      {t('rejectCancellation')}
                    </button>
                  </form>
                )}
              </article>
            ))}
          </div>

          <h2>{t('openDisputes')}</h2>
          <div className="grid">
            {disputes.data?.map((item) => (
              <article className="card" key={item.id}>
                <span className="badge">{item.status}</span>
                <p>{item.reason}</p>
                <p className="muted">
                  {t('jobVersion')}: {item.jobs?.version ?? '—'} · {item.jobs?.status ?? '—'}
                </p>
                {item.jobs && item.status === 'open' && (
                  <form action={resolveDispute} className="inline-form">
                    <DurableCommandIntent
                      intentKey={`dispute-resolution:${item.id}`}
                      initialIntentId={crypto.randomUUID()}
                    />
                    <input type="hidden" name="disputeId" value={item.id} />
                    <input type="hidden" name="expectedJobVersion" value={item.jobs.version} />
                    <label>
                      {t('resolutionAction')}
                      <select name="action" required>
                        <option value="no_financial_action">{t('noFinancialAction')}</option>
                        {canFinance && (
                          <option value="release_to_provider">{t('releaseToProvider')}</option>
                        )}
                        {canFinance && (
                          <option value="refund_customer">{t('refundCustomer')}</option>
                        )}
                        {canFinance && <option value="split">{t('splitResolution')}</option>}
                      </select>
                    </label>
                    <label>
                      {t('jobOutcome')}
                      <select name="jobOutcome" required>
                        <option value="resume">{t('resumeJob')}</option>
                        <option value="complete">{t('completeJob')}</option>
                        <option value="cancel">{t('cancelJob')}</option>
                        <option value="close_no_further_work">{t('closeNoFurtherWork')}</option>
                      </select>
                    </label>
                    <label>
                      {t('amountMinor')}
                      <input
                        name="amountMinor"
                        type="number"
                        min="0"
                        step="1"
                        defaultValue="0"
                        required
                      />
                    </label>
                    <label>
                      {t('decisionReason')}
                      <input name="reason" minLength={5} maxLength={2000} required />
                    </label>
                    <button type="submit">{t('resolveDispute')}</button>
                  </form>
                )}
              </article>
            ))}
          </div>
        </>
      )}
    </main>
  );
}
