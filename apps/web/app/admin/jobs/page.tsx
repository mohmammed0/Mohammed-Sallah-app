import { requireAdmin } from '@/lib/auth';
export default async function JobsPage() {
  const { client } = await requireAdmin(['support.case.read']);
  const { data, error } = await client
    .from('jobs')
    .select(
      'id,status,approved_total_minor,currency,version,scheduled_start,created_at,service_requests(title)',
    )
    .order('created_at', { ascending: false })
    .limit(100);
  return (
    <main id="main" className="shell section">
      <h1>الأعمال وحالات التنفيذ</h1>
      {error && <p className="error">تعذر تحميل الأعمال.</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>العمل</th>
              <th>الحالة</th>
              <th>الإجمالي</th>
              <th>الموعد</th>
              <th>نسخة</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((job) => (
              <tr key={job.id}>
                <td>{job.service_requests?.title ?? job.id.slice(0, 8)}</td>
                <td>
                  <span className="badge">{job.status}</span>
                </td>
                <td>
                  {(job.approved_total_minor / 100).toFixed(2)} {job.currency}
                </td>
                <td>
                  {job.scheduled_start
                    ? new Date(job.scheduled_start).toLocaleString('ar-SA')
                    : 'غير مجدول'}
                </td>
                <td>{job.version}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
