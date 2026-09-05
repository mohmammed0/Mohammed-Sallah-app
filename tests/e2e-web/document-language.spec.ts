import { expect, test } from '@playwright/test';

for (const [locale, direction] of [
  ['ar', 'rtl'],
  ['en', 'ltr'],
  ['ur', 'rtl'],
  ['hi', 'ltr'],
] as const) {
  test(`initial ${locale} HTML has the correct language without JavaScript`, async ({
    request,
  }) => {
    const response = await request.get(`/${locale}/privacy`, {
      headers: { 'x-sallah-document-locale': locale === 'ar' ? 'en' : 'ar' },
    });
    expect(response.ok()).toBe(true);
    const root = (await response.text()).match(/<html\b[^>]*>/i)?.[0];
    expect(root).toContain(`lang="${locale}"`);
    expect(root).toContain(`dir="${direction}"`);
  });
}

test('an unlocalized document ignores a supplied language header', async ({ request }) => {
  const response = await request.get('/login', {
    headers: { 'x-sallah-document-locale': 'en' },
  });
  expect(response.ok()).toBe(true);
  const root = (await response.text()).match(/<html\b[^>]*>/i)?.[0];
  expect(root).toContain('lang="ar"');
  expect(root).toContain('dir="rtl"');
});

test('encoded English locale retains English server HTML', async ({ request }) => {
  const response = await request.get('/%65n/privacy', {
    headers: { 'x-sallah-document-locale': 'ar' },
  });
  expect(response.ok()).toBe(true);
  const root = (await response.text()).match(/<html\b[^>]*>/i)?.[0];
  expect(root).toContain('lang="en"');
  expect(root).toContain('dir="ltr"');
});
