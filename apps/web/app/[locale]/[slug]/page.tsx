import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { supportedLocales, type SupportedLocale } from '@sallah/i18n';
import { pages, type PublicSlug } from '@/content';
import { SiteShell } from '@/components/site-shell';
import {
  PublicContactContent,
  PublicPolicyContent,
  PublicPolicyLoading,
  PublicPolicyShell,
  publicPolicyTypes,
  type PublicPolicySlug,
} from '@/components/public-policy';
export function generateStaticParams() {
  const pagesInMainLanguages = (['ar', 'en'] as const).flatMap((locale) =>
    Object.keys(pages).map((slug) => ({ locale, slug })),
  );
  return [
    ...pagesInMainLanguages,
    ...(['ur', 'hi'] as const).flatMap((locale) =>
      [...Object.keys(publicPolicyTypes), 'contact'].map((slug) => ({ locale, slug })),
    ),
  ];
}
export default async function ContentPage({
  params,
}: {
  params: Promise<{ locale: string; slug: string }>;
}) {
  const { locale, slug: slugRaw } = await params;
  if (!supportedLocales.includes(locale as SupportedLocale) || !Object.hasOwn(pages, slugRaw))
    notFound();
  if (Object.hasOwn(publicPolicyTypes, slugRaw) || slugRaw === 'contact') {
    const publicLocale = locale as SupportedLocale;
    const policySlug = slugRaw as PublicPolicySlug | 'contact';
    return (
      <PublicPolicyShell locale={publicLocale} slug={policySlug}>
        <Suspense fallback={<PublicPolicyLoading locale={publicLocale} />}>
          {policySlug === 'contact' ? (
            <PublicContactContent locale={publicLocale} />
          ) : (
            <PublicPolicyContent locale={publicLocale} slug={policySlug} />
          )}
        </Suspense>
      </PublicPolicyShell>
    );
  }
  if (locale !== 'ar' && locale !== 'en') notFound();
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
        {slug === 'cancellation' && (
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
