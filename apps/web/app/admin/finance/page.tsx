import { translate, type TranslationKey } from '@sallah/i18n';
import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { DurableCommandIntent } from '@/components/durable-command-intent';
import { confirmFinancialAction, decideCancellation, resolveDispute } from '../actions';

const t = (key: TranslationKey) => translate('ar', key);
const actionLabels: Record<string, TranslationKey> = {
  void_authorization: 'voidAuthorization',
  refund: 'refundCustomer',
  manual_refund: 'manualRefund',
  release: 'releaseToProvider',
};
const sourceLabels: Record<string, TranslationKey> = {
  cancellation: 'cancellationSource',
  dispute: 'disputeSource',
};
const queueSchema = z.object({
  disputes: z.array(
    z.object({
      disputeId: z.uuid(),
      jobId: z.uuid(),
      status: z.string(),
      jobVersion: z.number().int(),
      approvedTotalMinor: z.number().int(),
      paymentId: z.uuid().nullable(),
      paymentMode: z.string().nullable(),
      capturedAmountMinor: z.number().int().nullable(),
      refundedMinor: z.number().int().nullable(),
      heldAmountMinor: z.number().int(),
      createdAt: z.string(),
    }),
  ),
  cancellations: z.array(
    z.object({
      cancellationId: z.uuid(),
      jobId: z.uuid().nullable(),
      requestId: z.uuid().nullable(),
      status: z.string(),
      jobVersion: z.number().int().nullable(),
      approvedTotalMinor: z.number().int().nullable(),
      paymentId: z.uuid().nullable(),
      paymentMode: z.string().nullable(),
      capturedAmountMinor: z.number().int().nullable(),
      refundedMinor: z.number().int().nullable(),
      createdAt: z.string(),
    }),
  ),
  intents: z.array(
    z.object({
      intentId: z.uuid(),
      sourceType: z.string(),
      sourceId: z.uuid(),
      actionType: z.string(),
      amountMinor: z.number().int(),
      status: z.string(),
      createdAt: z.string(),
    }),
  ),
});

export default async function FinancePage() {
  const { client } = await requireAdmin(['finance.read']);
  const response = await client.rpc('get_finance_review_queue');
  const queue = queueSchema.safeParse(response.data);
  const hasError = Boolean(response.error) || !queue.success;

  return (
    <main id="main" className="shell section">
      <h1>{t('adminFinanceTitle')}</h1>
      <div className="notice">{t('financeTruthNotice')}</div>
      {hasError && <p className="error">{t('financialLedgerLoadFailed')}</p>}

      <h2>{t('openDisputes')}</h2>
      <div className="grid">
        {queue.success &&
          queue.data.disputes.map((item) => (
            <article className="card" key={item.disputeId}>
              <span className="badge">{item.status}</span>
              <p>
                {t('jobVersion')}: {item.jobVersion}
              </p>
              <p>
                {t('amountMinor')}: {item.approvedTotalMinor}
              </p>
              <p>
                {t('openFinancialHolds')}: {item.heldAmountMinor}
              </p>
              <form action={resolveDispute} className="inline-form">
                <DurableCommandIntent
                  intentKey={`dispute-resolution:${item.disputeId}`}
                  initialIntentId={crypto.randomUUID()}
                />
                <input type="hidden" name="disputeId" value={item.disputeId} />
                <input type="hidden" name="expectedJobVersion" value={item.jobVersion} />
                <label>
                  {t('resolutionAction')}
                  <select name="action" required>
                    <option value="release_to_provider">{t('releaseToProvider')}</option>
                    <option value="refund_customer">{t('refundCustomer')}</option>
                    <option value="split">{t('splitResolution')}</option>
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
                <input
                  name="amountMinor"
                  type="number"
                  min="0"
                  step="1"
                  required
                  placeholder={t('amountMinor')}
                />
                <input
                  name="reason"
                  minLength={5}
                  maxLength={2000}
                  required
                  placeholder={t('decisionReason')}
                />
                <button type="submit">{t('resolveDispute')}</button>
              </form>
            </article>
          ))}
      </div>

      <h2>{t('cancellations')}</h2>
      <div className="grid">
        {queue.success &&
          queue.data.cancellations.map((item) => (
            <article className="card" key={item.cancellationId}>
              <span className="badge">{item.status}</span>
              <p>
                {t('amountMinor')}: {item.approvedTotalMinor ?? 0}
              </p>
              {item.jobVersion && (
                <form action={decideCancellation} className="inline-form">
                  <DurableCommandIntent
                    intentKey={`cancellation-decision:${item.cancellationId}`}
                    initialIntentId={crypto.randomUUID()}
                  />
                  <input type="hidden" name="cancellationId" value={item.cancellationId} />
                  <input type="hidden" name="expectedJobVersion" value={item.jobVersion} />
                  <input name="feeMinor" type="number" min="0" step="1" defaultValue="0" required />
                  <input
                    name="reason"
                    minLength={5}
                    maxLength={1000}
                    required
                    placeholder={t('decisionReason')}
                  />
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

      <h2>{t('pendingFinancialActions')}</h2>
      <div className="grid">
        {queue.success &&
          queue.data.intents.map((item) => (
            <article className="card" key={item.intentId}>
              <span className="badge">
                {t(actionLabels[item.actionType] ?? 'pendingFinancialActions')}
              </span>
              <p>
                {t('source')}: {t(sourceLabels[item.sourceType] ?? 'source')} ·{' '}
                {item.sourceId.slice(0, 8)}
              </p>
              <p>
                {t('amountMinor')}: {item.amountMinor}
              </p>
              <form action={confirmFinancialAction} className="inline-form">
                <DurableCommandIntent
                  intentKey={`financial-confirmation:${item.intentId}`}
                  initialIntentId={crypto.randomUUID()}
                />
                <input type="hidden" name="intentId" value={item.intentId} />
                <input
                  name="providerReference"
                  minLength={3}
                  maxLength={200}
                  required
                  placeholder={t('providerReference')}
                />
                <input
                  name="reason"
                  minLength={5}
                  maxLength={1000}
                  required
                  placeholder={t('confirmationReason')}
                />
                <button type="submit">{t('confirmExternalAction')}</button>
              </form>
            </article>
          ))}
      </div>
    </main>
  );
}
