import { notFound } from 'next/navigation';
import { pages, type PublicSlug } from '@/content';
import { SiteShell } from '@/components/site-shell';
export function generateStaticParams() {
  return (['ar', 'en'] as const).flatMap((locale) =>
    Object.keys(pages).map((slug) => ({ locale, slug })),
  );
}
export default async function ContentPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug: slugRaw } = await params;
  if ((locale !== 'ar' && locale !== 'en') || !(slugRaw in pages)) notFound();
  const slug = slugRaw as PublicSlug;
  const [title, body] = pages[slug][locale];
  return (
    <SiteShell locale={locale}>
      <header className="page-hero">
        <div className="shell">
          <span className="badge">SALLAH</span>
          <h1>{title}</h1>
        </div>
      </header>
      <article className="shell prose">
        <p>{body}</p>
        {['privacy', 'terms', 'cancellation'].includes(slug) && (
          <aside className="notice">
            {locale === 'ar'
              ? 'مسودة للمراجعة القانونية المختصة في المملكة العربية السعودية قبل الإطلاق.'
              : 'Draft for qualified Saudi legal review before launch.'}
          </aside>
        )}
      </article>
    </SiteShell>
  );
}
