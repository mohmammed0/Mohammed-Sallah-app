import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
const healthResult = z.object({
  data: z.record(z.string(), z.number()).nullable(),
  error: z.unknown().nullable(),
});
export default async function AdminPage() {
  const { client } = await requireAdmin();
  const raw: unknown = await client.rpc('admin_marketplace_health');
  const parsed = healthResult.safeParse(raw);
  const error = !parsed.success || parsed.data.error !== null;
  const metrics = parsed.success ? (parsed.data.data ?? {}) : {};
  const cards: ReadonlyArray<readonly [string, string]> = [
    ['طلبات جديدة', 'new_requests'],
    ['أعمال نشطة', 'active_jobs'],
    ['دعم مفتوح', 'open_support_cases'],
    ['نزاعات', 'open_disputes'],
    ['تحقق معلق', 'pending_verifications'],
    ['فشل إشعارات', 'notification_failures'],
    ['حجوزات مالية', 'financial_holds'],
  ];
  return (
    <main id="main" className="shell section">
      <h1>لوحة العمليات</h1>
      {error && (
        <div className="notice">
          تعذر تحميل البيانات الحالية. لم تُعرض بيانات تجريبية بدلًا منها.
        </div>
      )}
      <div className="grid">
        {cards.map(([label, key]) => (
          <article className="card" key={key}>
            <span>{label}</span>
            <div className="metric">{metrics[key] ?? 0}</div>
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
