import { expect, test } from '@playwright/test';

const adminEmail = 'admin.demo@example.invalid';
const adminPassword = 'LocalE2E-Only!2026';

async function createAdminDatabaseSession() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('LOCAL_SUPABASE_PUBLIC_ENV_REQUIRED');
  const response = await fetch(`${url}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: key, 'content-type': 'application/json' },
    body: JSON.stringify({ email: adminEmail, password: adminPassword }),
  });
  const payload: unknown = await response.json();
  if (
    !response.ok ||
    typeof payload !== 'object' ||
    payload === null ||
    !('access_token' in payload) ||
    typeof payload.access_token !== 'string'
  ) {
    throw new Error(`LOCAL_ADMIN_AUTH_FAILED_${response.status}`);
  }
  return { key, token: payload.access_token, url };
}

async function readRow(
  session: Awaited<ReturnType<typeof createAdminDatabaseSession>>,
  table: string,
  id: string,
  select: string,
): Promise<Record<string, unknown>> {
  const response = await fetch(
    `${session.url}/rest/v1/${table}?select=${encodeURIComponent(select)}&id=eq.${id}`,
    {
      headers: { apikey: session.key, authorization: `Bearer ${session.token}` },
    },
  );
  const payload: unknown = await response.json();
  if (!response.ok || !Array.isArray(payload) || payload.length !== 1) {
    throw new Error(`LOCAL_ADMIN_READ_FAILED_${response.status}`);
  }
  const row = payload[0];
  if (typeof row !== 'object' || row === null) throw new Error('LOCAL_ADMIN_ROW_INVALID');
  return row as Record<string, unknown>;
}

test('operations admin records human cancellation and dispute decisions', async ({
  page,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The state-changing admin journey runs once.');

  const database = await createAdminDatabaseSession();

  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill(adminEmail);
  await page.getByLabel('كلمة المرور').fill(adminPassword);
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
  await expect
    .poll(async () => {
      const row = await readRow(
        database,
        'cancellation_requests',
        'e2500000-0000-4000-8000-000000000001',
        'status',
      );
      return row.status;
    })
    .toBe('rejected');

  const dispute = page.getByText('نزاع عرض محلي غير نهائي').locator('xpath=ancestor::article');
  await expect(dispute.getByRole('option', { name: 'حل دون تحويل مالي' })).toBeAttached();
  await dispute.getByLabel('سبب القرار').fill('حل بشري موثق دون إجراء مالي للاختبار');
  await dispute.getByRole('button', { name: 'تسجيل قرار النزاع' }).click();
  await expect(page.getByText('نزاع عرض محلي غير نهائي')).toHaveCount(0);
  await expect
    .poll(async () => {
      return readRow(
        database,
        'disputes',
        'e3000000-0000-4000-8000-000000000001',
        'status,resolution_outcome',
      );
    })
    .toEqual({ resolution_outcome: 'resume', status: 'resolved' });
});
