import { requireAdmin } from '@/lib/auth';
import { reviewProvider } from '../actions';

export default async function ProvidersPage() {
  const { client, roles } = await requireAdmin();
  const { data, error } = await client
    .from('provider_profiles')
    .select(
      'user_id,kind,business_name,verification_status,rating_average,rating_count,completed_jobs,created_at',
    )
    .order('created_at', { ascending: false })
    .limit(100);
  const canReview = roles.some(
    (role) => role === 'verification_reviewer' || role === 'super_admin',
  );
  return (
    <main id="main" className="shell section">
      <h1>مراجعة مقدمي الخدمة</h1>
      {error && <p className="error">تعذر تحميل الطابور.</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>المقدم</th>
              <th>النوع</th>
              <th>الحالة</th>
              <th>الأداء</th>
              <th>قرار</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((provider) => (
              <tr key={provider.user_id}>
                <td>{provider.business_name || provider.user_id.slice(0, 8)}</td>
                <td>{provider.kind}</td>
                <td>
                  <span className="badge">{provider.verification_status}</span>
                </td>
                <td>
                  {Number(provider.rating_average).toFixed(1)} · {provider.completed_jobs} عمل
                </td>
                <td>
                  {canReview ? (
                    <form action={reviewProvider} className="inline-form">
                      <input type="hidden" name="providerId" value={provider.user_id} />
                      <select name="decision" defaultValue="more_information_required">
                        <option value="verified">تحقق</option>
                        <option value="more_information_required">معلومات إضافية</option>
                        <option value="rejected">رفض</option>
                        <option value="suspended">تعليق</option>
                      </select>
                      <input
                        name="reason"
                        minLength={5}
                        maxLength={1000}
                        required
                        placeholder="سبب القرار"
                      />
                      <button className="button" type="submit">
                        تسجيل القرار
                      </button>
                    </form>
                  ) : (
                    'قراءة فقط'
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </main>
  );
}
