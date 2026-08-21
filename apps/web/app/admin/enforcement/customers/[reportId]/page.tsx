import Link from 'next/link';
import { redirect } from 'next/navigation';
import { translate, type TranslationKey } from '@sallah/i18n';
import { ConfirmedCommandIntentConsumer } from '@/components/confirmed-command-intent-consumer';
import { DurableCommandIntent } from '@/components/durable-command-intent';
import { requireModerationOperations } from '@/lib/auth';
import {
  moderationErrorCategory,
  parseConfirmedIntentId,
  parseModerationEnforcementTarget,
} from '@/lib/moderation';
import { setCustomerStatus } from '../../../actions';

const t = (key: TranslationKey) => translate('ar', key);
const errorLabels = {
  validation: 'adminModerationErrorValidation',
  conflict: 'adminModerationErrorConflict',
  permission: 'adminModerationErrorPermission',
  not_found: 'adminModerationErrorNotFound',
  state: 'adminModerationErrorState',
  unavailable: 'adminModerationErrorUnavailable',
} as const satisfies Readonly<Record<string, TranslationKey>>;

export default async function CustomerEnforcementPage({
  params,
  searchParams,
}: {
  params: Promise<{ reportId: string }>;
  searchParams: Promise<{
    notice?: string | string[];
    error?: string | string[];
    confirmedIntentId?: string | string[];
  }>;
}) {
  const { reportId } = await params;
  const { client } = await requireModerationOperations();
  const targetResponse = await client.rpc('get_marketplace_report_enforcement_target', {
    p_report_id: reportId,
  });
  if (targetResponse.error) {
    redirect(`/admin/moderation?error=${moderationErrorCategory(targetResponse.error)}`);
  }

  const target = (() => {
    try {
      return parseModerationEnforcementTarget(targetResponse.data);
    } catch {
      return null;
    }
  })();
  if (!target || target.reportId !== reportId || target.targetRole !== 'customer') {
    redirect('/admin/moderation?error=not_found');
  }
  const query = await searchParams;
  const notice = query.notice === 'updated';
  const errorKey =
    typeof query.error === 'string' && Object.hasOwn(errorLabels, query.error)
      ? errorLabels[query.error as keyof typeof errorLabels]
      : null;
  const confirmedIntentId =
    notice && !errorKey ? parseConfirmedIntentId(query.confirmedIntentId) : null;
  const action = setCustomerStatus.bind(null, { reportId: target.reportId });

  return (
    <main id="main" className="shell section">
      <ConfirmedCommandIntentConsumer confirmedIntentId={confirmedIntentId} />
      <h1 tabIndex={-1}>{t('adminModerationCustomerEnforcementTitle')}</h1>
      <p>{t('adminModerationCustomerEnforcementLead')}</p>
      {notice && (
        <p role="status" aria-live="polite" className="notice" tabIndex={-1}>
          {t('adminModerationCustomerEnforcementSuccess')}
        </p>
      )}
      {errorKey && (
        <p role="alert" className="error" tabIndex={-1}>
          {t(errorKey)}
        </p>
      )}
      <p>
        <strong>{t('adminModerationEnforcementTarget')}:</strong> {target.reportedUserId}
      </p>
      <form action={action} className="inline-form">
        <DurableCommandIntent
          intentKey={`moderation-customer-enforcement:${target.reportId}`}
          initialIntentId={crypto.randomUUID()}
          confirmedIntentId={confirmedIntentId}
        />
        <label>
          {t('adminModerationDesiredAccountStatus')}
          <select name="status" defaultValue="suspended">
            <option value="active">{t('adminModerationAccountActive')}</option>
            <option value="suspended">{t('adminModerationAccountSuspended')}</option>
          </select>
        </label>
        <label>
          {t('adminModerationReason')}
          <input name="reason" minLength={5} maxLength={1000} required />
        </label>
        <button type="submit">{t('adminModerationApplyAccountStatus')}</button>
      </form>
      <Link className="button secondary" href="/admin/moderation">
        {t('adminModerationBackToQueue')}
      </Link>
    </main>
  );
}
