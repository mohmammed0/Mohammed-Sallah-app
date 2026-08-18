import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { setCustomerStatus } from '../actions';

const searchSchema = z.string().trim().max(80).catch('');

export default async function CustomersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const { client, roles } = await requireAdmin(['customer.pii.read']);
  const rawQuery = (await searchParams).q ?? '';
  const query = searchSchema.parse(rawQuery);
  const safeQuery = query
    .replace(/[,%_()]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  let customersQuery = client
    .from('profiles')
    .select(
      'id,display_name,phone,preferred_locale,status,created_at,user_roles!inner(role),service_requests(count),support_cases(count),account_deletion_requests(status,requested_at,retention_snapshot,failure_category)',
    )
    .eq('user_roles.role', 'customer')
    .order('created_at', { ascending: false })
    .limit(100);
  if (safeQuery) {
    customersQuery = customersQuery.or(
      `display_name.ilike.%${safeQuery}%,phone.ilike.%${safeQuery}%`,
    );
  }
  const { data, error } = await customersQuery;
  const canWrite = roles.some((role) => role === 'operations_admin' || role === 'super_admin');

  return (
    <main id="main" className="shell section">
      <h1>إدارة العملاء</h1>
      <form className="inline-form" method="get">
        <label className="field">
          <span>البحث بالاسم أو الهاتف</span>
          <input name="q" defaultValue={query} maxLength={80} autoComplete="off" />
        </label>
        <button className="button" type="submit">
          بحث
        </button>
      </form>
      <p>تعليق الحساب وإعادة تنشيطه يتطلبان صلاحية تشغيلية وسببًا محفوظًا في سجل التدقيق.</p>
      {error && <p className="error">تعذر تحميل العملاء.</p>}
      <div className="table-wrap">
        <table className="table">
          <thead>
            <tr>
              <th>العميل</th>
              <th>الحالة</th>
              <th>النشاط</th>
              <th>الحذف</th>
              <th>إجراء مدقق</th>
            </tr>
          </thead>
          <tbody>
            {data?.map((customer) => {
              const nextStatus = customer.status === 'active' ? 'suspended' : 'active';
              const phone = customer.phone
                ? `${customer.phone.slice(0, 4)}••••${customer.phone.slice(-2)}`
                : 'لا يوجد هاتف';
              const deletion = customer.account_deletion_requests
                .slice()
                .sort((a, b) => b.requested_at.localeCompare(a.requested_at))[0];
              const blockerCount = Object.entries(
                (deletion?.retention_snapshot as Record<string, unknown> | null) ?? {},
              ).filter(
                ([key, value]) =>
                  !['policyVersion', 'ledgerRetentionYears'].includes(key) &&
                  typeof value === 'number' &&
                  value > 0,
              ).length;
              return (
                <tr key={customer.id}>
                  <td>
                    {customer.display_name || 'دون اسم'}
                    <small className="muted">
                      {phone} · {customer.preferred_locale.toUpperCase()} ·{' '}
                      {customer.id.slice(0, 8)}
                    </small>
                  </td>
                  <td>
                    <span className="badge">{customer.status}</span>
                  </td>
                  <td>
                    {customer.service_requests[0]?.count ?? 0} طلب ·{' '}
                    {customer.support_cases[0]?.count ?? 0} دعم
                  </td>
                  <td>
                    {deletion?.status ?? 'لا يوجد طلب مفتوح'}
                    {deletion && (
                      <small className="muted">
                        {blockerCount} عوائق · {deletion.failure_category ?? 'لا يوجد فشل'}
                      </small>
                    )}
                  </td>
                  <td>
                    {canWrite &&
                    (customer.status === 'active' || customer.status === 'suspended') ? (
                      <form action={setCustomerStatus} className="inline-form">
                        <input type="hidden" name="customerId" value={customer.id} />
                        <input type="hidden" name="status" value={nextStatus} />
                        <input
                          name="reason"
                          minLength={5}
                          maxLength={1000}
                          required
                          placeholder="سبب القرار"
                        />
                        <button
                          className={nextStatus === 'suspended' ? 'button danger' : 'button'}
                          type="submit"
                        >
                          {nextStatus === 'suspended' ? 'تعليق الحساب' : 'إعادة التنشيط'}
                        </button>
                      </form>
                    ) : (
                      'قراءة فقط'
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {!error && data?.length === 0 && <p>لا توجد نتائج مطابقة.</p>}
    </main>
  );
}
