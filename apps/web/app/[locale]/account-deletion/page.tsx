import { SiteShell } from '@/components/site-shell';
export default async function AccountDeletion({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  const locale = raw === 'en' ? 'en' : 'ar';
  const ar = locale === 'ar';
  return (
    <SiteShell locale={locale}>
      <header className="page-hero">
        <div className="shell">
          <h1>{ar ? 'طلب حذف الحساب' : 'Account deletion request'}</h1>
        </div>
      </header>
      <section className="shell prose">
        <p>
          {ar
            ? 'يمكن للمستخدم المسجل بدء الحذف من إعدادات التطبيق بعد إعادة التحقق. يدعم هذا النموذج الطلب الخارجي.'
            : 'Signed-in users should start deletion in app settings after reverification. This form supports external requests.'}
        </p>
        <form className="form" method="post" action="/api/account/deletion">
          <label className="field">
            <span>{ar ? 'البريد المرتبط بالحساب' : 'Account email'}</span>
            <input type="email" name="email" required autoComplete="email" />
          </label>
          <label className="field">
            <span>{ar ? 'سبب الطلب (اختياري)' : 'Reason (optional)'}</span>
            <textarea name="reason" maxLength={1000} />
          </label>
          <label>
            <input type="checkbox" required name="confirm" />{' '}
            {ar
              ? 'أفهم أن بعض السجلات قد تُجهّل وتُحتفظ بها لأسباب مالية أو أمنية مشروعة وفق السياسة المراجعة.'
              : 'I understand some records may be anonymized and retained for legitimate financial or security reasons under reviewed policy.'}
          </label>
          <button className="button" type="submit">
            {ar ? 'إرسال طلب آمن' : 'Send secure request'}
          </button>
        </form>
      </section>
    </SiteShell>
  );
}
