import { requireAdmin } from '@/lib/auth';
export default async function FinancePage() {
  const { client } = await requireAdmin(['finance_reviewer', 'super_admin']);
  const [payments, settlements, holds] = await Promise.all([
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
  ]);
  const hasError = payments.error || settlements.error || holds.error;
  return (
    <main id="main" className="shell section">
      <h1>المراجعة المالية</h1>
      <div className="notice">
        الوضع الافتراضي دفع بعد الخدمة. لا توجد ادعاءات تحصيل أو تسوية إلكترونية دون بوابة مهيأة.
      </div>
      {hasError && <p className="error">تعذر تحميل السجل المالي.</p>}
      <h2>المدفوعات</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>المعرف</th>
              <th>القيمة</th>
              <th>الوضع</th>
              <th>الحالة</th>
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
      <h2>التسويات والحجوزات</h2>
      <div className="grid">
        <article className="card">
          <h3>التسويات</h3>
          <p className="metric">{settlements.data?.length ?? 0}</p>
        </article>
        <article className="card">
          <h3>الحجوزات المفتوحة</h3>
          <p className="metric">
            {holds.data?.filter((item) => item.status === 'held').length ?? 0}
          </p>
        </article>
      </div>
    </main>
  );
}
