import { z } from 'npm:zod@4.4.3';

export const providerBriefRequestSchema = z.object({
  requestId: z.uuid(),
  force: z.boolean().default(false),
});
export const briefLocaleSchema = z.enum(['ar', 'en', 'ur', 'hi']);
export const originalBriefSchema = z.object({
  title: z.string().min(1).max(500),
  problemSummary: z.string().min(1).max(8000),
  originalText: z.string().min(1).max(8000),
  categoryName: z.string().min(1).max(500),
  categorySlug: z.string().min(1).max(200),
  cityName: z.string().min(1).max(500),
  cityCode: z.string().min(1).max(100),
  districtId: z.uuid().nullable(),
  urgency: z.string().min(1).max(100),
  requestedStart: z.string().nullable(),
  timingMode: z.enum(['asap', 'scheduled', 'flexible']),
  requestVersion: z.number().int().positive(),
  safetyNotes: z.array(z.string().max(500)).max(20),
});
export const translatedFieldsSchema = z.object({
  title: z.string().min(1).max(500),
  problemSummary: z.string().min(1).max(8000),
  originalText: z.string().min(1).max(8000),
  categoryName: z.string().min(1).max(500),
  cityName: z.string().min(1).max(500),
  safetyNotes: z.array(z.string().max(500)).max(20),
});
export type OriginalBrief = z.infer<typeof originalBriefSchema>;
export type TranslatedFields = z.infer<typeof translatedFieldsSchema>;

export function protectedBriefFields(original: OriginalBrief) {
  return {
    categorySlug: original.categorySlug,
    cityCode: original.cityCode,
    districtId: original.districtId,
    urgency: original.urgency,
    requestedStart: original.requestedStart,
    timingMode: original.timingMode,
    requestVersion: original.requestVersion,
  };
}

export function deterministicTestTranslation(
  original: OriginalBrief,
  target: z.infer<typeof briefLocaleSchema>,
): TranslatedFields {
  const labels = {
    ar: 'ترجمة اختبارية',
    en: 'Test translation',
    ur: 'آزمائشی ترجمہ',
    hi: 'परीक्षण अनुवाद',
  } as const;
  const prefix = labels[target];
  return translatedFieldsSchema.parse({
    title: `${prefix}: ${original.title}`,
    problemSummary: `${prefix}: ${original.problemSummary}`,
    originalText: `${prefix}: ${original.originalText}`,
    categoryName: `${prefix}: ${original.categoryName}`,
    cityName: `${prefix}: ${original.cityName}`,
    safetyNotes: original.safetyNotes.map((note) => `${prefix}: ${note}`),
  });
}
