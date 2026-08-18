import { requireAdmin } from '@/lib/auth';
export default async function RequestsPage() {
  const { client } = await requireAdmin(['support.case.read']);
  const { data, error } = await client
    .from('service_requests')
    .select(
      'id,title,status,urgency,original_locale,customer_approved_at,published_at,version,cities(name_ar)',
    )
    .order('created_at', { ascending: false })
    .limit(100);
  return (
    <main id="main" className="shell section">
      <h1>طلبات الخدمة</h1>
      {error && <p className="error">تعذر تحميل الطلبات.</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>الطلب</th>
              <th>المدينة</th>
              <th>الحالة</th>
              <th>الأولوية</th>
              <th>الموافقة</th>
              <th>نسخة</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((request) => (
              <tr key={request.id}>
                <td>
                  {request.title}
                  <small className="muted">{request.id}</small>
                </td>
                <td>{request.cities?.name_ar ?? '—'}</td>
                <td>
                  <span className="badge">{request.status}</span>
                </td>
                <td>{request.urgency}</td>
                <td>{request.customer_approved_at ? 'موثقة' : 'غير موثقة'}</td>
                <td>{request.version}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
