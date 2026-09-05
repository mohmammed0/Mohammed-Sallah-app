import { expect, test } from '@playwright/test';
import { direction, supportedLocales, translate } from '../../packages/i18n/src/index';

for (const locale of supportedLocales) {
  test(`reviewed policy availability, keyboard access and language: ${locale}`, async ({
    page,
  }, testInfo) => {
    await page.goto(`/${locale}/privacy`);
    const shell = page.locator('.public-policy');
    await expect(shell).toHaveAttribute('lang', locale);
    await expect(shell).toHaveAttribute('dir', direction(locale));
    await expect(page.locator('html')).toHaveAttribute('lang', locale);
    await expect(page.locator('html')).toHaveAttribute('dir', direction(locale));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(translate(locale, 'privacy'));
    // The disposable seed contains unapproved drafts. Never display them as approved policies.
    await expect(page.locator('.policy-content [role="status"]')).toContainText(
      translate(locale, 'publicLegalUnavailable'),
    );
    await expect(page.locator('[data-public-policy]')).toHaveCount(0);
    await expect(page.locator('.policy-languages a')).toHaveCount(4);
    await page.keyboard.press('Tab');
    const skip = page.getByRole('link', {
      name: translate(locale, 'publicSkipToContent'),
      exact: true,
    });
    await expect(skip).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(new RegExp(`/${locale}/privacy#main$`));
    await page.locator('.page-hero h1').click();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await testInfo.attach(`public-policy-${locale}-${testInfo.project.name}`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth),
    ).toBe(true);
    await testInfo.attach(`public-policy-${locale}-${testInfo.project.name}-large-text`, {
      body: await page.screenshot({ fullPage: true }),
      contentType: 'image/png',
    });
    const nextLocale = locale === 'ar' ? 'en' : 'ar';
    await page.locator(`.policy-languages a[lang="${nextLocale}"]`).click();
    await expect(page.locator('html')).toHaveAttribute('lang', nextLocale);
    await expect(page.locator('html')).toHaveAttribute('dir', direction(nextLocale));
    await expect(page.getByRole('heading', { level: 1 })).toHaveText(
      translate(nextLocale, 'privacy'),
    );
  });
}
