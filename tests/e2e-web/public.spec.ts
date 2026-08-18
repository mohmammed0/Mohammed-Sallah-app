import { expect, test } from '@playwright/test';
test('Arabic public journey is accessible and complete', async ({ page }) => {
  await page.goto('/ar');
  await expect(page).toHaveTitle(/صلّح/);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('خلّها علينا');
  await expect(page.getByRole('link', { name: 'اطلب خدمة' })).toBeVisible();
  await page.getByRole('link', { name: 'كيف تعمل' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('كيف تعمل');
});
test('English and deletion page render real forms', async ({ page }) => {
  await page.goto('/en/account-deletion');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Account deletion');
  await expect(page.getByLabel('Account email')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send secure request' })).toBeVisible();
});
test('security headers are present', async ({ request }) => {
  const response = await request.get('/api/health');
  expect(response.ok()).toBeTruthy();
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['content-security-policy']).toContain("frame-ancestors 'none'");
});
