import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  raw: null as unknown,
  rpcCalls: [] as string[],
}));

const client = {
  rpc: async (name: string) => {
    state.rpcCalls.push(name);
    return state.raw;
  },
};

vi.mock('@/lib/auth', () => ({
  requireAdmin: async () => ({ client }),
}));

const validMetrics = {
  new_requests: 1,
  active_jobs: 2,
  open_support_cases: 3,
  open_disputes: 4,
  pending_verifications: 5,
  notification_failures: 6,
  financial_holds: 7,
  ai_provider_failures: 8,
  transcription_failures: 9,
  translation_failures: 10,
  scanner_failures: 11,
  scanner_cleanup_failures: 12,
  push_dead_letters: 13,
  scheduler_failures: 14,
  open_incidents: 15,
} as const;

async function renderAdminPage() {
  const { default: AdminPage } = await import('../app/admin/page');
  return renderToStaticMarkup(await AdminPage());
}

describe('minimum beta operational health dashboard', () => {
  beforeEach(() => {
    state.rpcCalls = [];
    state.raw = { data: validMetrics, error: null };
  });

  it('renders every required aggregate and operational metric from the authorized RPC', async () => {
    const html = await renderAdminPage();

    expect(state.rpcCalls).toEqual(['admin_marketplace_health']);
    for (const [key, value] of Object.entries(validMetrics)) {
      expect(html).toContain(`data-metric-key="${key}"`);
      expect(html).toContain(`<div class="metric">${String(value)}</div>`);
    }
    expect(html).toContain('فشل مزود الذكاء الاصطناعي');
    expect(html).toContain('فشل النسخ الصوتي');
    expect(html).toContain('فشل الترجمة');
    expect(html).toContain('فشل الماسح');
    expect(html).toContain('فشل تنظيف الماسح');
    expect(html).toContain('إشعارات دفع متعذرة');
    expect(html).toContain('فشل المجدول');
    expect(html).toContain('حوادث مفتوحة');
  });

  it.each([
    ['an extra metric', { ...validMetrics, unexpected_healthy_count: 0 }],
    ['a non-numeric metric', { ...validMetrics, scanner_failures: '0' }],
    ['a missing required metric', { ...validMetrics, open_incidents: undefined }],
  ])('fails closed when the RPC data contains %s', async (_caseName, data) => {
    state.raw = { data, error: null };

    const html = await renderAdminPage();

    expect(html).toContain('تعذر تحميل البيانات الحالية');
    expect(html).not.toContain('<div class="metric">0</div>');
    expect(html).not.toContain('<div class="metric">11</div>');
    expect(html.match(/<div class="metric">غير متاح<\/div>/g)).toHaveLength(15);
  });

  it('fails closed for an extra top-level RPC field instead of presenting fake healthy counts', async () => {
    state.raw = { data: validMetrics, error: null, ignored: true };

    const html = await renderAdminPage();

    expect(html).toContain('تعذر تحميل البيانات الحالية');
    expect(html).not.toContain('<div class="metric">1</div>');
    expect(html.match(/<div class="metric">غير متاح<\/div>/g)).toHaveLength(15);
  });

  it('fails closed when the RPC reports an error', async () => {
    state.raw = { data: validMetrics, error: { code: 'temporary_failure' } };

    const html = await renderAdminPage();

    expect(html).toContain('تعذر تحميل البيانات الحالية');
    expect(html).not.toContain('<div class="metric">1</div>');
    expect(html.match(/<div class="metric">غير متاح<\/div>/g)).toHaveLength(15);
  });
});
