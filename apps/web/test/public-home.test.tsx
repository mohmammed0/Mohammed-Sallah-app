import { renderToStaticMarkup } from 'react-dom/server';
import { resources, translate } from '@sallah/i18n';
import { describe, expect, it } from 'vitest';
import Home from '../app/[locale]/page';

describe('public marketplace home', () => {
  it.each([
    ['ar', 'rtl'],
    ['en', 'ltr'],
  ] as const)(
    'keeps %s navigation and a keyboard-accessible main destination',
    async (locale, dir) => {
      const html = renderToStaticMarkup(await Home({ params: Promise.resolve({ locale }) }));

      expect(html).toContain(`lang="${locale}" dir="${dir}"`);
      expect(html).toContain(`href="#main">${translate(locale, 'publicSkipToContent')}</a>`);
      expect(html).toContain('<main id="main" tabindex="-1">');
      expect(html.match(/<h1\b/gu)).toHaveLength(1);
      expect(html).toContain('href="/login?mode=customer"');
      expect(html).toContain('href="/login?mode=provider"');
      expect(html).toContain('href="/login"');

      for (const slug of [
        'services',
        'how-it-works',
        'safety',
        'providers',
        'privacy',
        'terms',
        'community-standards',
        'contact',
        'account-deletion',
      ]) {
        expect(html).toContain(`href="/${locale}/${slug}"`);
      }
    },
  );

  it.each(['ur', 'hi'] as const)(
    'provides explicit %s translations for the new public copy',
    (locale) => {
      const dictionary = resources[locale].translation;
      const publicKeys = Object.keys(resources.ar.translation).filter(
        (key): key is keyof typeof dictionary =>
          key.startsWith('webHome') || key.startsWith('webNav'),
      );

      expect(publicKeys.length).toBeGreaterThan(0);
      for (const key of publicKeys) {
        expect(dictionary[key], `${locale}.${key}`).not.toBe(resources.en.translation[key]);
        expect(dictionary[key], `${locale}.${key}`).toMatch(
          locale === 'ur' ? /[\u0600-\u06ff]/u : /[\u0900-\u097f]/u,
        );
      }
    },
  );
});
