import Link from 'next/link';
import { connection } from 'next/server';
import { readPublicSupportEmail } from '@sallah/config/web';
import type { LegalDocument } from '@sallah/domain';
import {
  direction,
  supportedLocales,
  translate,
  type SupportedLocale,
  type TranslationKey,
} from '@sallah/i18n';
import { loadPublicLegalDocument } from '@/lib/public-legal';

export const publicPolicyTypes = {
  privacy: 'privacy',
  terms: 'terms',
  'community-standards': 'community',
} as const satisfies Record<string, LegalDocument['documentType']>;
export type PublicPolicySlug = keyof typeof publicPolicyTypes;
export type PublicInformationSlug = PublicPolicySlug | 'contact';
const titles = {
  privacy: 'privacy',
  terms: 'terms',
  'community-standards': 'publicCommunityStandards',
  contact: 'publicContact',
} as const satisfies Record<PublicInformationSlug, TranslationKey>;

export function PublicPolicyShell({
  locale,
  slug,
  children,
}: {
  readonly locale: SupportedLocale;
  readonly slug: PublicInformationSlug;
  readonly children: React.ReactNode;
}) {
  return (
    <div className="public-policy" lang={locale} dir={direction(locale)}>
      <header className="site-header">
        <nav className="shell policy-nav" aria-label={translate(locale, 'publicNavigation')}>
          <Link className="brand" href={locale === 'ar' || locale === 'ur' ? '/ar' : '/en'}>
            {translate(locale, 'appName')}
          </Link>
          {(Object.keys(titles) as PublicInformationSlug[]).map((item) => (
            <Link
              key={item}
              href={`/${locale}/${item}`}
              aria-current={item === slug ? 'page' : undefined}
            >
              {translate(locale, titles[item])}
            </Link>
          ))}
        </nav>
      </header>
      <main id="main">
        <header className="page-hero">
          <div className="shell">
            <h1>{translate(locale, titles[slug])}</h1>
            <nav
              className="policy-languages"
              aria-label={translate(locale, 'publicDocumentLanguage')}
            >
              {supportedLocales.map((language) => (
                <a
                  key={language}
                  href={`/${language}/${slug}`}
                  lang={language}
                  hrefLang={language}
                  aria-current={language === locale ? 'page' : undefined}
                >
                  {new Intl.DisplayNames([language], { type: 'language' }).of(language)}
                </a>
              ))}
            </nav>
          </div>
        </header>
        <article className="shell prose policy-content">{children}</article>
      </main>
    </div>
  );
}

export function PublicPolicyLoading({ locale }: { readonly locale: SupportedLocale }) {
  return (
    <p role="status" aria-live="polite">
      {translate(locale, 'publicLegalLoading')}
    </p>
  );
}

export function PublicPolicyDocument({
  locale,
  slug,
  document,
}: {
  readonly locale: SupportedLocale;
  readonly slug: PublicPolicySlug;
  readonly document: LegalDocument | null;
}) {
  if (!document)
    return (
      <div className="notice" role="status">
        <p>{translate(locale, 'publicLegalUnavailable')}</p>
        <a className="button secondary" href={`/${locale}/${slug}`}>
          {translate(locale, 'retry')}
        </a>
      </div>
    );
  return (
    <section data-public-policy={document.documentType} aria-labelledby="policy-title">
      <h2 id="policy-title">{document.title}</h2>
      <p className="policy-version">
        {translate(locale, 'legalDocumentVersion', {
          version: document.version,
          language:
            new Intl.DisplayNames([locale], { type: 'language' }).of(document.locale) ??
            document.locale,
        })}
      </p>
      <div className="policy-document-body">{document.body}</div>
    </section>
  );
}

export async function PublicPolicyContent({
  locale,
  slug,
}: {
  readonly locale: SupportedLocale;
  readonly slug: PublicPolicySlug;
}) {
  // Approved policies can change or be withdrawn; never bake them into a static build.
  await connection();
  const document = await loadPublicLegalDocument(locale, publicPolicyTypes[slug]);
  return <PublicPolicyDocument locale={locale} slug={slug} document={document} />;
}

export async function PublicContactContent({ locale }: { readonly locale: SupportedLocale }) {
  await connection();
  const address = readPublicSupportEmail();
  if (!address)
    return (
      <p className="notice" role="status">
        {translate(locale, 'publicContactUnavailable')}
      </p>
    );
  return (
    <>
      <p>{translate(locale, 'publicContactLead')}</p>
      <a className="button secondary" href={`mailto:${address}`} dir="ltr">
        {address}
      </a>
    </>
  );
}
