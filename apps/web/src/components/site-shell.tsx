import Link from 'next/link';
import type { PublicLocale } from '@/content';
const labels = {
  ar: {
    how: 'كيف تعمل',
    services: 'الخدمات',
    safety: 'السلامة',
    providers: 'لمقدمي الخدمة',
    login: 'دخول',
  },
  en: {
    how: 'How it works',
    services: 'Services',
    safety: 'Safety',
    providers: 'For providers',
    login: 'Sign in',
  },
} as const;
export function SiteShell({
  locale,
  children,
}: {
  locale: PublicLocale;
  children: React.ReactNode;
}) {
  const l = labels[locale];
  return (
    <div dir={locale === 'ar' ? 'rtl' : 'ltr'}>
      <header className="site-header">
        <nav className="shell nav" aria-label="Primary">
          <Link className="brand" href={`/${locale}`}>
            صلّح <small>SALLAH</small>
          </Link>
          <div className="nav-links">
            <Link href={`/${locale}/how-it-works`}>{l.how}</Link>
            <Link href={`/${locale}/services`}>{l.services}</Link>
            <Link href={`/${locale}/safety`}>{l.safety}</Link>
            <Link href={`/${locale}/providers`}>{l.providers}</Link>
          </div>
          <Link className="button secondary" href="/login">
            {l.login}
          </Link>
        </nav>
        <nav
          className="shell mobile-nav"
          aria-label={locale === 'ar' ? 'التنقل على الهاتف' : 'Mobile navigation'}
        >
          <Link href={`/${locale}/how-it-works`}>{l.how}</Link>
          <Link href={`/${locale}/services`}>{l.services}</Link>
          <Link href={`/${locale}/safety`}>{l.safety}</Link>
          <Link href={`/${locale}/providers`}>{l.providers}</Link>
        </nav>
      </header>
      <main id="main">{children}</main>
      <footer className="footer">
        <div className="shell footer-grid">
          <div>
            <strong>صلّح · SALLAH</strong>
            <br />
            <span>Riyadh pilot · SAR · Asia/Riyadh</span>
          </div>
          <div>
            <Link href={`/${locale}/privacy`}>Privacy</Link> ·{' '}
            <Link href={`/${locale}/terms`}>Terms</Link> ·{' '}
            <Link href={`/${locale}/account-deletion`}>Account deletion</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
