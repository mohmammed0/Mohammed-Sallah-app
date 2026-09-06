import Link from 'next/link';
import { direction, translate } from '@sallah/i18n';
import type { PublicLocale } from '@/content';

const navigation = [
  { slug: 'services', label: 'webNavServices' },
  { slug: 'how-it-works', label: 'howItWorks' },
  { slug: 'safety', label: 'safety' },
  { slug: 'providers', label: 'webNavProviders' },
] as const;

const policies = [
  { slug: 'privacy', label: 'privacy' },
  { slug: 'terms', label: 'terms' },
  { slug: 'community-standards', label: 'publicCommunityStandards' },
  { slug: 'contact', label: 'publicContact' },
  { slug: 'account-deletion', label: 'deleteAccount' },
] as const;

export function SiteShell({
  locale,
  children,
}: {
  locale: PublicLocale;
  children: React.ReactNode;
}) {
  return (
    <div className="public-site" lang={locale} dir={direction(locale)}>
      <header className="site-header">
        <nav className="shell nav" aria-label={translate(locale, 'publicNavigation')}>
          <Link className="brand" href={`/${locale}`}>
            <span className="brand-mark" aria-hidden="true">
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
                focusable="false"
              >
                <path d="m3 10 9-7 9 7M5 9v12h14V9M9 14l2 2 4-4" />
              </svg>
            </span>
            <span className="brand-name">
              {translate(locale, 'appName')}
              {locale === 'ar' && <small lang="en">SALLAH</small>}
            </span>
          </Link>
          <div className="nav-links">
            {navigation.map((item) => (
              <Link key={item.slug} href={`/${locale}/${item.slug}`}>
                {translate(locale, item.label)}
              </Link>
            ))}
          </div>
          <Link className="button secondary nav-sign-in" href="/login">
            {translate(locale, 'signIn')}
          </Link>
        </nav>
        <nav className="shell mobile-nav" aria-label={translate(locale, 'publicNavigation')}>
          {navigation.map((item) => (
            <Link key={item.slug} href={`/${locale}/${item.slug}`}>
              {translate(locale, item.label)}
            </Link>
          ))}
        </nav>
      </header>
      <main id="main" tabIndex={-1}>
        {children}
      </main>
      <footer className="footer">
        <div className="shell footer-grid">
          <div className="footer-brand">
            <Link className="footer-brand__name" href={`/${locale}`}>
              {translate(locale, 'appName')}
              {locale === 'ar' && <span lang="en">SALLAH</span>}
            </Link>
            <p>{translate(locale, 'webHomeEyebrow')}</p>
            <span className="footer-pilot">{translate(locale, 'webNavPilot')}</span>
          </div>
          <nav className="footer-links" aria-label={translate(locale, 'publicNavigation')}>
            <h2>{translate(locale, 'webNavExplore')}</h2>
            {navigation.map((item) => (
              <Link key={item.slug} href={`/${locale}/${item.slug}`}>
                {translate(locale, item.label)}
              </Link>
            ))}
          </nav>
          <nav className="footer-links" aria-label={translate(locale, 'legalDocuments')}>
            <h2>{translate(locale, 'webNavPolicies')}</h2>
            {policies.map((item) => (
              <Link key={item.slug} href={`/${locale}/${item.slug}`}>
                {translate(locale, item.label)}
              </Link>
            ))}
          </nav>
        </div>
      </footer>
    </div>
  );
}
