import Link from 'next/link';
import { notFound } from 'next/navigation';
import { translate } from '@sallah/i18n';
import { SiteShell } from '@/components/site-shell';
import type { PublicLocale } from '@/content';

const iconPaths = {
  home: 'M3 10.5 12 3l9 7.5M5 9v12h5v-7h4v7h5V9',
  note: 'M8 3H5v18h14V3h-3M9 2h6v4H9zM8 11h8M8 15h5',
  lock: 'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v11H5zM12 14v3',
  scope: 'M9 3H5v18h14V3h-4M9 2h6v4H9zM8 12l2 2 5-5M8 18h8',
  arrow: 'M4 12h16m-6-6 6 6-6 6',
} as const;

function HomeIcon({ name }: { name: keyof typeof iconPaths }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={iconPaths[name]} />
    </svg>
  );
}

export function generateStaticParams() {
  return [{ locale: 'ar' }, { locale: 'en' }];
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (raw !== 'ar' && raw !== 'en') notFound();
  const locale: PublicLocale = raw;
  const steps = [
    { title: 'describeProblem', body: 'webHomeDescribeBody' },
    { title: 'compareOffers', body: 'webHomeCompareBody' },
    { title: 'webHomeTrackTitle', body: 'webHomeTrackBody' },
  ] as const;
  const benefits = [
    { icon: 'note', title: 'webHomeAssistantTitle', body: 'webHomeAssistantBody' },
    { icon: 'lock', title: 'webHomeOffersTitle', body: 'webHomeOffersBody' },
    { icon: 'scope', title: 'webHomeChangeTitle', body: 'webHomeChangeBody' },
  ] as const;

  return (
    <SiteShell locale={locale}>
      <section className="home-hero" aria-labelledby="home-title">
        <div className="shell home-hero__grid">
          <div className="home-hero__copy">
            <p className="home-eyebrow">{translate(locale, 'webHomeEyebrow')}</p>
            <h1 id="home-title">{translate(locale, 'webHomeTitle')}</h1>
            <p className="home-hero__lead">{translate(locale, 'webHomeLead')}</p>
            <div className="actions">
              <Link className="button" href="/login?mode=customer">
                {translate(locale, 'newRequest')}
                <span className="directional-icon">
                  <HomeIcon name="arrow" />
                </span>
              </Link>
              <Link className="button secondary" href="/login?mode=provider">
                {translate(locale, 'webHomeJoinProvider')}
              </Link>
            </div>
            <Link className="home-text-link" href={`/${locale}/services`}>
              {translate(locale, 'serviceCategories')}
              <span className="directional-icon">
                <HomeIcon name="arrow" />
              </span>
            </Link>
          </div>

          <section className="home-journey" aria-labelledby="home-journey-title">
            <div className="home-journey__heading">
              <span className="home-journey__icon">
                <HomeIcon name="home" />
              </span>
              <h2 id="home-journey-title">{translate(locale, 'webHomeJourneyTitle')}</h2>
            </div>
            <ol className="home-steps" role="list">
              {steps.map((step, index) => (
                <li key={step.title}>
                  <span className="home-step-number" aria-hidden="true">
                    {new Intl.NumberFormat(locale, { minimumIntegerDigits: 2 }).format(index + 1)}
                  </span>
                  <div>
                    <h3>{translate(locale, step.title)}</h3>
                    <p>{translate(locale, step.body)}</p>
                  </div>
                </li>
              ))}
            </ol>
            <Link className="home-journey__link" href={`/${locale}/how-it-works`}>
              {translate(locale, 'howItWorks')}
              <span className="directional-icon">
                <HomeIcon name="arrow" />
              </span>
            </Link>
          </section>
        </div>
      </section>

      <section className="home-benefits" aria-labelledby="home-privacy-title">
        <div className="shell">
          <div className="home-section-heading">
            <div>
              <p className="home-eyebrow">{translate(locale, 'welcomeBadge')}</p>
              <h2 id="home-privacy-title">{translate(locale, 'webHomePrivacyTitle')}</h2>
            </div>
            <p>{translate(locale, 'webHomePrivacyBody')}</p>
          </div>
          <div className="home-benefits__grid">
            {benefits.map((benefit) => (
              <article className="home-benefit" key={benefit.title}>
                <span className="home-benefit__icon">
                  <HomeIcon name={benefit.icon} />
                </span>
                <h3>{translate(locale, benefit.title)}</h3>
                <p>{translate(locale, benefit.body)}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="home-provider shell" aria-labelledby="home-provider-title">
        <div>
          <p className="home-eyebrow">{translate(locale, 'webNavProviders')}</p>
          <h2 id="home-provider-title">{translate(locale, 'webHomeProviderTitle')}</h2>
          <p className="home-provider__lead">{translate(locale, 'webHomeProviderBody')}</p>
        </div>
        <Link className="button secondary" href={`/${locale}/providers`}>
          {translate(locale, 'providerBenefits')}
          <span className="directional-icon">
            <HomeIcon name="arrow" />
          </span>
        </Link>
      </section>
    </SiteShell>
  );
}
