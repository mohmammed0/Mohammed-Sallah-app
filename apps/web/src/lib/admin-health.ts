import { z } from 'zod';

const metricCount = z.number().int().min(0).max(Number.MAX_SAFE_INTEGER);

const adminHealthMetricsSchema = z.strictObject({
  new_requests: metricCount,
  active_jobs: metricCount,
  open_support_cases: metricCount,
  open_disputes: metricCount,
  pending_verifications: metricCount,
  notification_failures: metricCount,
  financial_holds: metricCount,
  ai_provider_failures: metricCount,
  transcription_failures: metricCount,
  translation_failures: metricCount,
  scanner_failures: metricCount,
  scanner_cleanup_failures: metricCount,
  push_dead_letters: metricCount,
  scheduler_failures: metricCount,
  open_incidents: metricCount,
});

const adminHealthRpcSchema = z.strictObject({
  data: adminHealthMetricsSchema.nullable(),
  error: z.unknown().nullable(),
  count: z.number().int().min(0).nullable().optional(),
  status: z.number().int().min(100).max(599).optional(),
  statusText: z.string().max(128).optional(),
});

export const adminHealthCards = [
  { label: 'طلبات جديدة', key: 'new_requests' },
  { label: 'أعمال نشطة', key: 'active_jobs' },
  { label: 'دعم مفتوح', key: 'open_support_cases' },
  { label: 'نزاعات', key: 'open_disputes' },
  { label: 'تحقق معلق', key: 'pending_verifications' },
  { label: 'فشل إشعارات', key: 'notification_failures' },
  { label: 'حجوزات مالية', key: 'financial_holds' },
  { label: 'فشل مزود الذكاء الاصطناعي', key: 'ai_provider_failures' },
  { label: 'فشل النسخ الصوتي', key: 'transcription_failures' },
  { label: 'فشل الترجمة', key: 'translation_failures' },
  { label: 'فشل الماسح', key: 'scanner_failures' },
  { label: 'فشل تنظيف الماسح', key: 'scanner_cleanup_failures' },
  { label: 'إشعارات دفع متعذرة', key: 'push_dead_letters' },
  { label: 'فشل المجدول', key: 'scheduler_failures' },
  { label: 'حوادث مفتوحة', key: 'open_incidents' },
] as const satisfies ReadonlyArray<{
  label: string;
  key: keyof z.infer<typeof adminHealthMetricsSchema>;
}>;

export type AdminHealthMetrics = z.infer<typeof adminHealthMetricsSchema>;

export function parseAdminHealthRpc(raw: unknown): AdminHealthMetrics | null {
  const parsed = adminHealthRpcSchema.safeParse(raw);
  if (
    !parsed.success ||
    parsed.data.error !== null ||
    parsed.data.data === null ||
    (parsed.data.status !== undefined && (parsed.data.status < 200 || parsed.data.status >= 300))
  ) {
    return null;
  }

  return parsed.data.data;
}
