import { requireAdmin } from '@/lib/auth';
export default async function SupportPage() {
  const { client } = await requireAdmin(['operations_admin', 'support_agent', 'super_admin']);
  const { data, error } = await client
    .from('support_cases')
    .select('id,subject,topic,priority,status,opened_by,created_at,updated_at')
    .order('updated_at', { ascending: false })
    .limit(100);
  const disputes = await client
    .from('disputes')
    .select('id,job_id,reason,priority,status,created_at')
    .order('created_at', { ascending: false })
    .limit(100);
  return (
    <main id="main" className="shell section">
      <h1>الدعم والنزاعات</h1>
      {(error || disputes.error) && <p className="error">تعذر تحميل أحد الطوابير.</p>}
      <h2>حالات الدعم</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>الموضوع</th>
              <th>الأولوية</th>
              <th>الحالة</th>
              <th>التحديث</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((item) => (
              <tr key={item.id}>
                <td>{item.subject}</td>
                <td>{item.priority}</td>
                <td>
                  <span className="badge">{item.status}</span>
                </td>
                <td>{new Date(item.updated_at).toLocaleString('ar-SA')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h2>النزاعات</h2>
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>السبب</th>
              <th>الأولوية</th>
              <th>الحالة</th>
              <th>الإنشاء</th>
            </tr>
          </thead>
          <tbody>
            {disputes.data?.map((item) => (
              <tr key={item.id}>
                <td>{item.reason}</td>
                <td>{item.priority}</td>
                <td>
                  <span className="badge">{item.status}</span>
                </td>
                <td>{new Date(item.created_at).toLocaleString('ar-SA')}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
