import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const request = vi.hoisted(() => ({ locale: 'ar', pathname: '/ar' }));
vi.mock('next/headers', () => ({
  headers: async () => new Headers({ 'x-sallah-document-locale': request.locale }),
}));
vi.mock('next/navigation', () => ({ usePathname: () => request.pathname }));

import RootLayout from '../app/layout';

describe('initial document language', () => {
  beforeEach(() => {
    request.locale = 'ar';
    request.pathname = '/ar';
  });

  it.each([
    ['ar', 'rtl'],
    ['en', 'ltr'],
    ['ur', 'rtl'],
    ['hi', 'ltr'],
  ])('renders %s HTML in the correct direction before client effects', async (locale, dir) => {
    request.locale = locale;
    request.pathname = `/${locale}/privacy`;
    const html = renderToStaticMarkup(
      await RootLayout({ children: <main id="main">Policy</main> }),
    );
    expect(html).toContain(`<html lang="${locale}" dir="${dir}">`);
  });

  it('uses the Arabic fallback for an unsupported request value', async () => {
    request.locale = 'invalid';
    const html = renderToStaticMarkup(await RootLayout({ children: <main /> }));
    expect(html).toContain('<html lang="ar" dir="rtl">');
  });
});
