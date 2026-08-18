import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteShell } from '@/components/site-shell';
import type { PublicLocale } from '@/content';
export function generateStaticParams() {
  return [{ locale: 'ar' }, { locale: 'en' }];
}
export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (raw !== 'ar' && raw !== 'en') notFound();
  const locale: PublicLocale = raw;
  const ar = locale === 'ar';
  return (
    <SiteShell locale={locale}>
      <section className="hero">
        <div className="shell hero-grid">
          <div>
            <div className="eyebrow">
              {ar
                ? 'خدمات أوضح. خصوصية أقوى. ثقة أكبر.'
                : 'Clearer service. Stronger privacy. Greater trust.'}
            </div>
            <h1>
              {ar
                ? 'خلّها علينا… من وصف المشكلة إلى إنجازها'
                : 'From describing the issue to getting it done'}
            </h1>
            <p>
              {ar
                ? 'اشرح المشكلة بصوتك أو كلماتك، راجع ملخصًا منظمًا، وقارن عروضًا خاصة من مقدمي خدمة مؤهلين.'
                : 'Describe the issue by voice or text, review a structured draft, and compare sealed offers from eligible providers.'}
            </p>
            <div className="actions">
              <Link className="button" href="/login?mode=customer">
                {ar ? 'اطلب خدمة' : 'Request service'}
              </Link>
              <Link className="button secondary" href="/login?mode=provider">
                {ar ? 'انضم كمقدم خدمة' : 'Join as provider'}
              </Link>
            </div>
          </div>
          <div className="trust-card" aria-label={ar ? 'خطوات الخدمة' : 'Service steps'}>
            {[
              [
                ar ? 'صف المشكلة' : 'Describe',
                [ar ? 'بالنص أو الصوت والصور' : 'Text, voice, and photos'],
              ],
              [
                ar ? 'قارن العروض' : 'Compare',
                [ar ? 'السعر والموعد والضمان' : 'Price, timing, warranty'],
              ],
              [
                ar ? 'تابع التنفيذ' : 'Track',
                [ar ? 'مسار موثق حتى القبول' : 'Audited path to acceptance'],
              ],
            ].map(([title, sub], index) => (
              <div className="step" key={String(title)}>
                <div className="step-number">{index + 1}</div>
                <div>
                  <strong>{title}</strong>
                  <br />
                  <span>{String(sub)}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
      <section className="section">
        <div className="shell">
          <span className="badge">{ar ? 'مصمم للسوق السعودي' : 'Built for Saudi Arabia'}</span>
          <h2 className="section-title">
            {ar ? 'السوق يحمي تفاصيلك في كل مرحلة' : 'Privacy built into every stage'}
          </h2>
          <p className="section-lead">
            {ar
              ? 'الموقع الدقيق والعروض والوثائق الحساسة لا تظهر إلا لمن يملك صلاحية فعلية.'
              : 'Exact locations, sealed offers, and private documents are limited to authorized participants.'}
          </p>
          <div className="grid">
            <article className="card">
              <h3>{ar ? 'مساعد تشخيصي قابل للتعديل' : 'Editable diagnostic assistant'}</h3>
              <p>
                {ar
                  ? 'يسأل أسئلة مناسبة ويعرض عدم اليقين ولا ينشر دون موافقتك.'
                  : 'Asks relevant questions, shows uncertainty, and never publishes without approval.'}
              </p>
            </article>
            <article className="card">
              <h3>{ar ? 'عروض خاصة' : 'Sealed offers'}</h3>
              <p>
                {ar
                  ? 'مقدم الخدمة لا يرى عروض المنافسين، وأنت تقارن التفاصيل بوضوح.'
                  : 'Providers cannot see competitors’ offers; customers compare clear details.'}
              </p>
            </article>
            <article className="card">
              <h3>{ar ? 'تغيير نطاق رسمي' : 'Formal change orders'}</h3>
              <p>
                {ar
                  ? 'أي زيادة تحتاج وصفًا وتسعيرًا وموافقة مسجلة قبل العمل الإضافي.'
                  : 'Additional work needs an itemized, recorded customer approval.'}
              </p>
            </article>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
