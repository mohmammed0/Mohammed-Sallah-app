import { z } from 'zod';
import { requireAdmin } from '@/lib/auth';
import { DurableCommandIntent } from '@/components/durable-command-intent';
import { setCustomerStatus } from '../actions';

const searchSchema = z.string().trim().max(80).catch('');
const customerSchema = z.array(
  z.object({
    id: z.uuid(),
    displayName: z.string(),
    phone: z.string().nullable(),
    preferredLocale: z.string(),
    status: z.string(),
    createdAt: z.string(),
    serviceRequestCount: z.number().int(),
    supportCaseCount: z.number().int(),
    deletion: z
      .object({
        status: z.string(),
        requestedAt: z.string(),
        retentionSnapshot: z.unknown().nullable(),
        failureCategory: z.string().nullable(),
      })
      .nullable(),
  }),
);

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
  const response = await client.rpc('list_customer_pii', {
    p_query: safeQuery,
    p_reason: safeQuery
      ? 'Reasoned customer administration search'
      : 'Reasoned customer administration queue review',
  });
  const parsed = customerSchema.safeParse(response.data);
  const data = parsed.success ? parsed.data : [];
  const error = response.error ?? (parsed.success ? null : new Error('CUSTOMER_PII_INVALID'));
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
            {data.map((customer) => {
              const nextStatus = customer.status === 'active' ? 'suspended' : 'active';
              const phone = customer.phone
                ? `${customer.phone.slice(0, 4)}••••${customer.phone.slice(-2)}`
                : 'لا يوجد هاتف';
              const deletion = customer.deletion;
              const blockerCount = Object.entries(
                (deletion?.retentionSnapshot as Record<string, unknown> | null) ?? {},
              ).filter(
                ([key, value]) =>
                  !['policyVersion', 'ledgerRetentionYears'].includes(key) &&
                  typeof value === 'number' &&
                  value > 0,
              ).length;
              return (
                <tr key={customer.id}>
                  <td>
                    {customer.displayName || 'دون اسم'}
                    <small className="muted">
                      {phone} · {customer.preferredLocale.toUpperCase()} · {customer.id.slice(0, 8)}
                    </small>
                  </td>
                  <td>
                    <span className="badge">{customer.status}</span>
                  </td>
                  <td>
                    {customer.serviceRequestCount} طلب · {customer.supportCaseCount} دعم
                  </td>
                  <td>
                    {deletion?.status ?? 'لا يوجد طلب مفتوح'}
                    {deletion && (
                      <small className="muted">
                        {blockerCount} عوائق · {deletion.failureCategory ?? 'لا يوجد فشل'}
                      </small>
                    )}
                  </td>
                  <td>
                    {canWrite &&
                    (customer.status === 'active' || customer.status === 'suspended') ? (
                      <form action={setCustomerStatus} className="inline-form">
                        <DurableCommandIntent
                          intentKey={`customer-status:${customer.id}`}
                          initialIntentId={crypto.randomUUID()}
                        />
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
      {!error && data.length === 0 && <p>لا توجد نتائج مطابقة.</p>}
    </main>
  );
}
