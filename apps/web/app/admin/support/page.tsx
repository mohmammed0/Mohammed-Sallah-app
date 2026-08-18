import { translate } from '@sallah/i18n';
import { requireAnyAdmin } from '@/lib/auth';
import {
  assignSupportCase,
  decideCancellation,
  endSupportAssignment,
  grantSupportAccess,
  resolveDispute,
  revokeSupportAccess,
} from '../actions';

const t = (key: Parameters<typeof translate>[1]) => translate('ar', key);

export default async function SupportPage() {
  const { client, roles } = await requireAnyAdmin([
    'support.case.read',
    'operations.marketplace.read',
  ]);
  const canFinance = roles.some((role) => role === 'finance_reviewer' || role === 'super_admin');
  const canOperate = roles.some((role) => role === 'operations_admin' || role === 'super_admin');
  const [cases, cancellations, disputes] = await Promise.all([
    client
      .from('support_cases')
      .select(
        'id,subject,topic,priority,status,opened_by,created_at,updated_at,support_case_assignments(id,assignee_id,assigned_at,expires_at,permissions,ended_at),support_case_access_grants(id,user_id,permissions,expires_at,revoked_at)',
      )
      .order('updated_at', { ascending: false })
      .limit(100),
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
  ]);
  const hasError = cases.error || cancellations.error || disputes.error;

  return (
    <main id="main" className="shell section">
      <h1>{t('adminSupportTitle')}</h1>
      <div className="notice">{t('humanDecisionNotice')}</div>
      {hasError && <p className="error">{t('adminQueueLoadFailed')}</p>}

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
                  {item.support_case_assignments
                    .filter((assignment) => !assignment.ended_at)
                    .map((assignment) => (
                      <form
                        action={endSupportAssignment}
                        className="inline-form"
                        key={assignment.id}
                      >
                        <input type="hidden" name="commandIntentId" value={crypto.randomUUID()} />
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
                        <input type="hidden" name="commandIntentId" value={crypto.randomUUID()} />
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
                        <input type="hidden" name="commandIntentId" value={crypto.randomUUID()} />
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
                        <input type="hidden" name="commandIntentId" value={crypto.randomUUID()} />
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
                <input type="hidden" name="commandIntentId" value={crypto.randomUUID()} />
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
                <input type="hidden" name="commandIntentId" value={crypto.randomUUID()} />
                <input type="hidden" name="disputeId" value={item.id} />
                <input type="hidden" name="expectedJobVersion" value={item.jobs.version} />
                <label>
                  {t('resolutionAction')}
                  <select name="action" required>
                    <option value="no_financial_action">{t('noFinancialAction')}</option>
                    {canFinance && (
                      <option value="release_to_provider">{t('releaseToProvider')}</option>
                    )}
                    {canFinance && <option value="refund_customer">{t('refundCustomer')}</option>}
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
    </main>
  );
}
