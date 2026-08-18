import { requireAdmin } from '@/lib/auth';
import { DurableCommandIntent } from '@/components/durable-command-intent';
import { setCategoryState } from '../actions';

export default async function CatalogPage() {
  const { client, roles } = await requireAdmin(['operations.mutate']);
  const { data, error } = await client
    .from('service_categories')
    .select(
      'id,slug,restricted,verification_required,enabled,sort_order,service_category_translations(locale,name)',
    )
    .order('sort_order');
  const canWrite = roles.some((role) => role === 'operations_admin' || role === 'super_admin');
  return (
    <main id="main" className="shell section">
      <h1>كتالوج الخدمات</h1>
      <p>المدن والفئات والأسئلة بيانات قاعدة، ولا تتطلب إصدار تطبيق جديد.</p>
      {error && <p className="error">تعذر تحميل الكتالوج.</p>}
      <div className="grid">
        {data?.map((category) => (
          <article className="card" key={category.id}>
            <span className="badge">{category.enabled ? 'enabled' : 'disabled'}</span>
            <h2>
              {category.service_category_translations.find((item) => item.locale === 'ar')?.name ??
                category.slug}
            </h2>
            <p>
              {category.restricted ? 'مقيدة/متخصصة' : 'عامة'} ·{' '}
              {category.verification_required ? 'تتطلب تحققًا' : 'لا تتطلب تحققًا خاصًا'}
            </p>
            {canWrite && (
              <form action={setCategoryState} className="form">
                <DurableCommandIntent
                  intentKey={`category-state:${category.id}`}
                  initialIntentId={crypto.randomUUID()}
                />
                <input type="hidden" name="categoryId" value={category.id} />
                <input type="hidden" name="enabled" value={category.enabled ? 'false' : 'true'} />
                <label className="field">
                  <span>سبب التغيير</span>
                  <input name="reason" required minLength={5} maxLength={1000} />
                </label>
                <button className="button" type="submit">
                  {category.enabled ? 'تعطيل مدقق' : 'تمكين مدقق'}
                </button>
              </form>
            )}
          </article>
        ))}
      </div>
    </main>
  );
}
