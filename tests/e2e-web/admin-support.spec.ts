import { expect, test } from '@playwright/test';

test('operations admin records human cancellation and dispute decisions', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The state-changing admin journey runs once.');

  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill('admin.demo@example.invalid');
  await page.getByLabel('كلمة المرور').fill('LocalE2E-Only!2026');
  await page.getByRole('button', { name: 'دخول آمن' }).click();
  await expect(page).toHaveURL(/\/admin$/);

  await page.goto('/admin/support');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('الدعم والإلغاء والنزاعات');
  await expect(page.getByText('لا تُحسم النزاعات آليًا')).toBeVisible();

  const cancellation = page
    .getByText('طلب إلغاء تجريبي للاختبار المتكامل')
    .locator('xpath=ancestor::article');
  await cancellation.getByLabel('سبب القرار').fill('رفض موثق في اختبار رحلة الإدارة');
  await cancellation.getByRole('button', { name: 'رفض الإلغاء' }).click();
  await expect(page.getByText('طلب إلغاء تجريبي للاختبار المتكامل')).toHaveCount(0);

  const dispute = page.getByText('نزاع عرض محلي غير نهائي').locator('xpath=ancestor::article');
  await expect(dispute.getByRole('option', { name: 'حل دون تحويل مالي' })).toBeAttached();
  await dispute.getByLabel('سبب القرار').fill('حل بشري موثق دون إجراء مالي للاختبار');
  await dispute.getByRole('button', { name: 'تسجيل قرار النزاع' }).click();
  await expect(page.getByText('نزاع عرض محلي غير نهائي')).toHaveCount(0);
});
