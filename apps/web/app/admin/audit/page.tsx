import { requireAdmin } from '@/lib/auth';
export default async function AuditPage() {
  const { client } = await requireAdmin(['operations_admin', 'super_admin']);
  const { data, error } = await client
    .from('admin_audit_logs')
    .select('id,actor_id,action,target_type,target_id,reason,correlation_id,created_at')
    .order('created_at', { ascending: false })
    .limit(200);
  return (
    <main id="main" className="shell section">
      <h1>سجل تدقيق الإدارة</h1>
      <p>السجل ملحق فقط؛ تمنع قاعدة البيانات تعديله أو حذفه.</p>
      {error && <p className="error">تعذر تحميل سجل التدقيق.</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>الوقت</th>
              <th>الإجراء</th>
              <th>الهدف</th>
              <th>السبب</th>
              <th>الارتباط</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((item) => (
              <tr key={item.id}>
                <td>{new Date(item.created_at).toLocaleString('ar-SA')}</td>
                <td>{item.action}</td>
                <td>
                  {item.target_type} · {item.target_id?.slice(0, 8)}
                </td>
                <td>{item.reason}</td>
                <td>{item.correlation_id}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
