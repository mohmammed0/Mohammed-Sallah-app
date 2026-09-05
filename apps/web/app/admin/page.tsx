import { requireAdmin } from '@/lib/auth';
import { adminHealthCards, parseAdminHealthRpc } from '@/lib/admin-health';

function metricState(value: number | null): {
  label: string;
  tone: 'stable' | 'attention' | 'unknown';
} {
  if (value === null) return { label: 'غير متاح', tone: 'unknown' };
  return value === 0
    ? { label: 'لا عناصر معلقة', tone: 'stable' }
    : { label: 'يتطلب مراجعة', tone: 'attention' };
}

export default async function AdminPage() {
  const { client } = await requireAdmin(['dashboard.aggregate.read']);
  const raw: unknown = await client.rpc('admin_marketplace_health');
  const metrics = parseAdminHealthRpc(raw);

  return (
    <main id="main" className="admin-dashboard">
      <section className="admin-dashboard-heading" aria-labelledby="admin-dashboard-title">
        <div>
          <p className="admin-kicker">نظرة تشغيلية مباشرة</p>
          <h1 id="admin-dashboard-title">لوحة العمليات</h1>
          <p>ملخص للطوابير الحساسة والمخاطر التي تحتاج قراراً من فريق مخوّل.</p>
        </div>
        <span className="admin-status-badge admin-status-badge--attention">مراجعة يومية</span>
      </section>
      {metrics === null && (
        <div className="notice admin-notice" role="alert">
          <strong>تعذر تحميل البيانات الحالية.</strong> لم تُعرض بيانات تجريبية بدلًا منها.
        </div>
      )}
      <section aria-label="مؤشرات العمليات" className="admin-metric-grid" aria-live="polite">
        {adminHealthCards.map(({ label, key }) => {
          const value = metrics === null ? null : metrics[key];
          const state = metricState(value);
          return (
            <article className="admin-metric-card" data-metric-key={key} key={key}>
              <div className="admin-metric-card__top">
                <span>{label}</span>
                <span className={`admin-status-badge admin-status-badge--${state.tone}`}>
                  {state.label}
                </span>
              </div>
              <div className="metric">{value === null ? 'غير متاح' : value}</div>
              <span className="admin-metric-card__hint">
                آخر 24 ساعة أو الحالة الحالية حسب المؤشر
              </span>
            </article>
          );
        })}
      </section>
      <section className="admin-queue-section" aria-labelledby="sensitive-queues-title">
        <div className="admin-section-heading">
          <div>
            <p className="admin-kicker">سير عمل مضبوط</p>
            <h2 id="sensitive-queues-title">طوابير حساسة</h2>
          </div>
          <span className="admin-empty-state">لا توجد إجراءات فورية في هذه القائمة</span>
        </div>
        <div className="table-wrap admin-table-wrap" tabIndex={0}>
          <table className="table admin-queue-table">
            <thead>
              <tr>
                <th>المسار</th>
                <th>التحكم</th>
                <th>التدقيق</th>
                <th>الحالة</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td data-label="المسار">التحقق من مقدم الخدمة</td>
                <td data-label="التحكم">مراجع أو مدير أعلى</td>
                <td data-label="التدقيق">سبب إلزامي وسجل دائم</td>
                <td data-label="الحالة">
                  <span className="admin-status-badge admin-status-badge--neutral">
                    مقيّد بالصلاحية
                  </span>
                </td>
              </tr>
              <tr>
                <td data-label="المسار">النزاعات والحجوزات</td>
                <td data-label="التحكم">الدعم/المالية حسب الصلاحية</td>
                <td data-label="التدقيق">لا قرارات آلية</td>
                <td data-label="الحالة">
                  <span className="admin-status-badge admin-status-badge--neutral">قرار بشري</span>
                </td>
              </tr>
              <tr>
                <td data-label="المسار">التسويات</td>
                <td data-label="التحكم">المالية فقط</td>
                <td data-label="التدقيق">خادم وقاعدة بيانات</td>
                <td data-label="الحالة">
                  <span className="admin-status-badge admin-status-badge--neutral">تدقيق دائم</span>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
