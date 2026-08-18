import { translate, type TranslationKey } from '@sallah/i18n';
import { requireAdmin } from '@/lib/auth';
import { confirmFinancialAction } from '../actions';

const t = (key: TranslationKey) => translate('ar', key);
const actionLabels: Record<string, TranslationKey> = {
  void_authorization: 'voidAuthorization',
  refund: 'refundCustomer',
  manual_refund: 'manualRefund',
};
const sourceLabels: Record<string, TranslationKey> = {
  cancellation: 'cancellationSource',
  dispute: 'disputeSource',
};

export default async function FinancePage() {
  const { client } = await requireAdmin(['finance_reviewer', 'super_admin']);
  const [payments, settlements, holds, intents] = await Promise.all([
    client
      .from('payments')
      .select('id,amount_minor,currency,status,payment_mode,provider_name,created_at')
      .order('created_at', { ascending: false })
      .limit(100),
    client
      .from('provider_settlements')
      .select('id,gross_minor,fee_minor,net_minor,status,provider_reference,created_at')
      .order('created_at', { ascending: false })
      .limit(100),
    client
      .from('financial_holds')
      .select('id,job_id,amount_minor,reason,status,created_at')
      .order('created_at', { ascending: false })
      .limit(100),
    client
      .from('financial_action_intents')
      .select('id,source_type,source_id,action_type,amount_minor,status,created_at')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(100),
  ]);
  const hasError = payments.error || settlements.error || holds.error || intents.error;

  return (
    <main id="main" className="shell section">
      <h1>{t('adminFinanceTitle')}</h1>
      <div className="notice">{t('financeTruthNotice')}</div>
      {hasError && <p className="error">{t('financialLedgerLoadFailed')}</p>}

      <h2>{t('payments')}</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>{t('identifier')}</th>
              <th>{t('amount')}</th>
              <th>{t('mode')}</th>
              <th>{t('status')}</th>
            </tr>
          </thead>
          <tbody>
            {payments.data?.map((item) => (
              <tr key={item.id}>
                <td>{item.id.slice(0, 8)}</td>
                <td>
                  {(item.amount_minor / 100).toFixed(2)} {item.currency}
                </td>
                <td>{item.payment_mode}</td>
                <td>{item.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <h2>{t('settlementsAndHolds')}</h2>
      <div className="grid">
        <article className="card">
          <h3>{t('settlements')}</h3>
          <p className="metric">{settlements.data?.length ?? 0}</p>
        </article>
        <article className="card">
          <h3>{t('openFinancialHolds')}</h3>
          <p className="metric">
            {holds.data?.filter((item) => item.status === 'held').length ?? 0}
          </p>
        </article>
      </div>

      <h2>{t('pendingFinancialActions')}</h2>
      <div className="grid">
        {intents.data?.map((item) => (
          <article className="card" key={item.id}>
            <span className="badge">
              {t(actionLabels[item.action_type] ?? 'pendingFinancialActions')}
            </span>
            <p>
              {t('source')}: {t(sourceLabels[item.source_type] ?? 'source')} ·{' '}
              {item.source_id.slice(0, 8)}
            </p>
            <p>
              {t('amountMinor')}: {item.amount_minor}
            </p>
            <form action={confirmFinancialAction} className="inline-form">
              <input type="hidden" name="intentId" value={item.id} />
              <label>
                {t('providerReference')}
                <input name="providerReference" minLength={3} maxLength={200} required />
              </label>
              <label>
                {t('confirmationReason')}
                <input name="reason" minLength={5} maxLength={1000} required />
              </label>
              <button type="submit">{t('confirmExternalAction')}</button>
            </form>
          </article>
        ))}
      </div>
    </main>
  );
}
