import { spawnSync } from 'node:child_process';
import { expect, test } from '@playwright/test';
import { parseCreatedReportId, resolveDockerCommand } from '../../apps/web/test/local-docker';

const adminEmail = 'admin.demo@example.invalid';
const adminPassword = 'LocalE2E-Only!2026';
const financeEmail = 'finance.demo@example.invalid';
const financePassword = 'LocalFinanceE2E-Only!2026';

test.describe.configure({ mode: 'serial' });

async function signIn(page: import('@playwright/test').Page, email: string, password: string) {
  await page.goto('/login');
  await page.getByLabel('البريد الإلكتروني').fill(email);
  await page.getByLabel('كلمة المرور').fill(password);
  await page.getByRole('button', { name: 'دخول آمن' }).click();
  await expect(page).toHaveURL(/\/admin$/);
}

function createReportThroughAuthenticatedCommand(): string {
  const idempotencyKey = `moderation-e2e-${Date.now()}`;
  const sql = `
begin;
set local role authenticated;
do $context$
begin
  perform set_config('request.jwt.claim.role','authenticated',true);
  perform set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
end
$context$;
select public.create_marketplace_report_v2(
  'user',
  'd2000000-0000-4000-8000-000000000001',
  'e0000000-0000-4000-8000-000000000001',
  'harassment',
  'Deterministic local moderation browser regression',
  '${idempotencyKey}'
);
commit;
`;
  const docker = resolveDockerCommand([
    'exec',
    '-i',
    'supabase_db_sallah',
    'psql',
    '-qAt',
    '-v',
    'ON_ERROR_STOP=1',
    '-U',
    'postgres',
    '-d',
    'postgres',
  ]);
  const result = spawnSync(docker.command, docker.args, {
    encoding: 'utf8',
    input: sql,
    shell: docker.shell,
  });
  if (result.status !== 0) {
    throw new Error(result.stderr || result.error?.message || 'LOCAL_MODERATION_FIXTURE_FAILED');
  }
  return parseCreatedReportId(result.stdout);
}

test('operations admin triages an authoritative marketplace report', async ({ page }, testInfo) => {
  test.skip(
    testInfo.project.name !== 'chromium',
    'The state-changing moderation journey runs once.',
  );
  const reportId = createReportThroughAuthenticatedCommand();
  await signIn(page, adminEmail, adminPassword);

  await page.goto('/admin/moderation');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('بلاغات السوق');
  const report = page.locator(`article[aria-labelledby="moderation-report-${reportId}"]`);
  await expect(report).toBeVisible();
  await expect(report.getByRole('link', { name: 'فتح حالة الدعم المرتبطة' })).toHaveAttribute(
    'href',
    /\/admin\/support\?caseId=[0-9a-f-]{36}$/u,
  );
  await expect(report.getByRole('link', { name: 'فتح مسار إنفاذ العميل' })).toHaveCount(0);
  await expect(report.getByRole('link', { name: 'فتح مسار إنفاذ مقدم الخدمة' })).toHaveCount(0);
  const priority = report.getByLabel('الأولوية');
  const currentPriority = await priority.inputValue();
  await priority.selectOption(currentPriority === 'urgent' ? 'low' : 'urgent');
  const triageButton = report.getByRole('button', { name: 'فرز البلاغ' });
  const triageForm = triageButton.locator('xpath=ancestor::form');
  await triageForm.getByLabel('سبب القرار').fill('مراجعة بشرية موثقة في اختبار عمليات البلاغات');
  const commandIntent = triageForm.locator('input[name="commandIntentId"]');
  const submittedIntentId = await commandIntent.inputValue();
  const intentStorageKey = `sallah:admin-command-intent:v1:marketplace-report-triage:${reportId}`;
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const value = localStorage.getItem(key);
        return value ? (JSON.parse(value) as { id?: unknown }).id : null;
      }, intentStorageKey),
    )
    .toBe(submittedIntentId);

  await triageForm.locator('input[name="expectedVersion"]').evaluate((input) => {
    (input as HTMLInputElement).value = '999999';
  });
  await triageButton.click();
  await expect(page.locator('main').getByRole('alert')).toContainText('تغير البلاغ');
  await expect(page).not.toHaveURL(/confirmedIntentId=/u);
  const retriedTriageButton = report.getByRole('button', { name: 'فرز البلاغ' });
  const retriedTriageForm = retriedTriageButton.locator('xpath=ancestor::form');
  const retriedCommandIntent = retriedTriageForm.locator('input[name="commandIntentId"]');
  await expect.poll(() => retriedCommandIntent.inputValue()).toBe(submittedIntentId);
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const value = localStorage.getItem(key);
        return value ? (JSON.parse(value) as { id?: unknown }).id : null;
      }, intentStorageKey),
    )
    .toBe(submittedIntentId);

  await retriedTriageForm
    .getByLabel('سبب القرار')
    .fill('مراجعة بشرية موثقة في اختبار عمليات البلاغات');
  await retriedTriageButton.click();

  await expect(page.getByRole('status')).toContainText('تم فرز البلاغ');
  await expect(page).toHaveURL(new RegExp(`confirmedIntentId=${submittedIntentId}(?:&|$)`, 'u'));
  await expect(report).toContainText('تم الفرز');
  const confirmedIntent = report
    .getByRole('button', { name: 'فرز البلاغ' })
    .locator('xpath=ancestor::form')
    .locator('input[name="commandIntentId"]');
  await expect.poll(() => confirmedIntent.inputValue()).not.toBe(submittedIntentId);
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const value = localStorage.getItem(key);
        return value ? (JSON.parse(value) as { id?: unknown }).id : null;
      }, intentStorageKey),
    )
    .not.toBe(submittedIntentId);

  const dismissButton = report.getByRole('button', { name: 'رفض البلاغ' });
  const dismissForm = dismissButton.locator('xpath=ancestor::form');
  await dismissForm.getByLabel('سبب القرار').fill('قرار نهائي موثق لاختبار تنظيف نية الأمر');
  const dismissIntentId = await dismissForm.locator('input[name="commandIntentId"]').inputValue();
  const dismissStorageKey = `sallah:admin-command-intent:v1:marketplace-report-dismiss:${reportId}`;
  await expect
    .poll(() =>
      page.evaluate((key) => {
        const value = localStorage.getItem(key);
        return value ? (JSON.parse(value) as { id?: unknown }).id : null;
      }, dismissStorageKey),
    )
    .toBe(dismissIntentId);

  await dismissButton.click();

  await expect(page.getByRole('status')).toContainText('تم رفض البلاغ');
  await expect(page).toHaveURL(new RegExp(`confirmedIntentId=${dismissIntentId}(?:&|$)`, 'u'));
  await expect(report).toHaveCount(0);
  await expect
    .poll(() => page.evaluate((key) => localStorage.getItem(key), dismissStorageKey))
    .toBeNull();
});

test('finance reviewer cannot open the moderation queue', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium', 'The authorization journey runs once.');
  await signIn(page, financeEmail, financePassword);
  await expect(page.getByRole('link', { name: 'بلاغات السوق' })).toHaveCount(0);
  await page.goto('/admin/moderation');
  await expect(page).toHaveURL(/\/forbidden$/);
});
