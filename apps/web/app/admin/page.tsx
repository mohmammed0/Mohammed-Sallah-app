import { requireAdmin } from '@/lib/auth';
import { adminHealthCards, parseAdminHealthRpc } from '@/lib/admin-health';

export default async function AdminPage() {
  const { client } = await requireAdmin(['dashboard.aggregate.read']);
  const raw: unknown = await client.rpc('admin_marketplace_health');
  const metrics = parseAdminHealthRpc(raw);

  return (
    <main id="main" className="shell section">
      <h1>لوحة العمليات</h1>
      {metrics === null && (
        <div className="notice">
          تعذر تحميل البيانات الحالية. لم تُعرض بيانات تجريبية بدلًا منها.
        </div>
      )}
      <div className="grid">
        {adminHealthCards.map(({ label, key }) => (
          <article className="card" data-metric-key={key} key={key}>
            <span>{label}</span>
            <div className="metric">{metrics === null ? 'غير متاح' : metrics[key]}</div>
          </article>
        ))}
      </div>
      <section className="section">
        <h2>طوابير حساسة</h2>
        <table className="table">
          <thead>
            <tr>
              <th>المسار</th>
              <th>التحكم</th>
              <th>التدقيق</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td>التحقق من مقدم الخدمة</td>
              <td>مراجع أو مدير أعلى</td>
              <td>سبب إلزامي وسجل دائم</td>
            </tr>
            <tr>
              <td>النزاعات والحجوزات</td>
              <td>الدعم/المالية حسب الصلاحية</td>
              <td>لا قرارات آلية</td>
            </tr>
            <tr>
              <td>التسويات</td>
              <td>المالية فقط</td>
              <td>خادم وقاعدة بيانات</td>
            </tr>
          </tbody>
        </table>
      </section>
    </main>
  );
}
