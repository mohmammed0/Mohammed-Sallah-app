import { requireAdmin } from '@/lib/auth';
import { DurableCommandIntent } from '@/components/durable-command-intent';
import { reviewProvider, reviewProviderService } from '../actions';

export default async function ProvidersPage() {
  const { client, roles } = await requireAdmin(['provider.document.read']);
  const { data, error } = await client
    .from('provider_profiles')
    .select(
      'user_id,kind,business_name,verification_status,rating_average,rating_count,completed_jobs,created_at,provider_services(category_id,subcategory_id,enabled,review_status,review_reason,service_categories(slug))',
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
                    <>
                      <form action={reviewProvider} className="inline-form">
                        <DurableCommandIntent
                          intentKey={`provider-review:${provider.user_id}`}
                          initialIntentId={crypto.randomUUID()}
                        />
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
                          تسجيل قرار الحساب
                        </button>
                      </form>
                      {provider.provider_services
                        .filter((service) => service.enabled)
                        .map((service) => (
                          <form
                            action={reviewProviderService}
                            className="inline-form"
                            key={service.category_id}
                          >
                            <DurableCommandIntent
                              intentKey={`provider-service-review:${provider.user_id}:${service.category_id}`}
                              initialIntentId={crypto.randomUUID()}
                            />
                            <input type="hidden" name="providerId" value={provider.user_id} />
                            <input type="hidden" name="categoryId" value={service.category_id} />
                            <span className="badge">
                              {service.service_categories?.slug ?? service.category_id.slice(0, 8)}{' '}
                              · {service.review_status}
                            </span>
                            <select name="decision" defaultValue="approved">
                              <option value="approved">اعتماد الخدمة</option>
                              <option value="more_information_required">معلومات إضافية</option>
                              <option value="rejected">رفض الخدمة</option>
                              <option value="suspended">تعليق الخدمة</option>
                            </select>
                            <input
                              name="reason"
                              minLength={5}
                              maxLength={2000}
                              required
                              placeholder="سبب قرار الخدمة"
                            />
                            <button className="button" type="submit">
                              تسجيل قرار الخدمة
                            </button>
                          </form>
                        ))}
                    </>
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
