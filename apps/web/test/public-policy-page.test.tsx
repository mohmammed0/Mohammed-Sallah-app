import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { direction, supportedLocales, translate } from '@sallah/i18n';
import type { LegalDocument } from '@sallah/domain';
import {
  PublicContactContent,
  PublicPolicyDocument,
  PublicPolicyLoading,
  PublicPolicyShell,
} from '../src/components/public-policy';
import ContentPage, { generateStaticParams } from '../app/[locale]/[slug]/page';

vi.mock('next/server', () => ({ connection: async () => undefined }));
const document: LegalDocument = {
  id: '11111111-1111-4111-8111-111111111111',
  documentType: 'privacy',
  locale: 'ar',
  version: 'fixture-v1',
  title: '<img src=x onerror=alert(1)>',
  body: '<script>malicious()</script>\n\nReadable text.',
  contentHash: 'a'.repeat(64),
  requiresAcceptance: true,
  accepted: false,
};

describe('public policy pages', () => {
  afterEach(() => vi.unstubAllEnvs());

  it('renders approved content as escaped text and preserves readable paragraph breaks', () => {
    const html = renderToStaticMarkup(
      <PublicPolicyDocument locale="ar" slug="privacy" document={document} />,
    );
    expect(html).toContain('&lt;img');
    expect(html).toContain('&lt;script&gt;malicious()&lt;/script&gt;\n\nReadable text.');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain(
      translate('ar', 'legalDocumentVersion', {
        version: 'fixture-v1',
        language: new Intl.DisplayNames(['ar'], { type: 'language' }).of('ar') ?? 'ar',
      }),
    );
    expect(html).not.toContain(document.id);
    expect(html).not.toContain(document.contentHash);
    expect(html).not.toContain('checkbox');
  });

  it.each(supportedLocales)(
    'provides accessible %s navigation, loading and unavailable states',
    (locale) => {
      const html = renderToStaticMarkup(
        <PublicPolicyShell locale={locale} slug="privacy">
          <PublicPolicyLoading locale={locale} />
          <PublicPolicyDocument locale={locale} slug="privacy" document={null} />
        </PublicPolicyShell>,
      );
      expect(html).toContain(`lang="${locale}" dir="${direction(locale)}"`);
      expect(html).toContain(translate(locale, 'publicLegalLoading'));
      expect(html).toContain(translate(locale, 'publicLegalUnavailable'));
      expect(html).toContain('role="status"');
      expect(html).toContain('aria-live="polite"');
      for (const language of supportedLocales)
        expect(html).toContain(`href="/${language}/privacy"`);
      expect(html).not.toContain('support@example.invalid');
    },
  );

  it('renders only a validated configured support address', async () => {
    vi.stubEnv('SALLAH_SUPPORT_EMAIL', 'support@example.invalid');
    const missing = renderToStaticMarkup(await PublicContactContent({ locale: 'en' }));
    expect(missing).toContain(translate('en', 'publicContactUnavailable'));
    expect(missing).not.toContain('mailto:');
    expect(missing).not.toContain('support@example.invalid');
    vi.stubEnv('SALLAH_SUPPORT_EMAIL', 'support@sallah-fixture.com');
    const configured = renderToStaticMarkup(await PublicContactContent({ locale: 'hi' }));
    expect(configured).toContain('href="mailto:support@sallah-fixture.com" dir="ltr"');
    expect(configured).toContain(translate('hi', 'publicContactLead'));
  });

  it('routes legal pages in all four locales and rejects unsupported/prototype slugs', async () => {
    for (const locale of supportedLocales) {
      for (const slug of ['privacy', 'terms', 'community-standards', 'contact']) {
        expect(generateStaticParams()).toContainEqual({ locale, slug });
        const tree = await ContentPage({ params: Promise.resolve({ locale, slug }) });
        expect(tree.type).toBe(PublicPolicyShell);
      }
    }
    for (const [locale, slug] of [
      ['fr', 'privacy'],
      ['ur', 'cities'],
      ['en', 'toString'],
    ]) {
      await expect(
        ContentPage({ params: Promise.resolve({ locale: locale!, slug: slug! }) }),
      ).rejects.toThrow();
    }
  });
});
