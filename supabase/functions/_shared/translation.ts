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
}).strict();
export const translatedFieldsSchema = z.object({
  title: z.string().min(1).max(500),
  problemSummary: z.string().min(1).max(8000),
  originalText: z.string().min(1).max(8000),
  categoryName: z.string().min(1).max(500),
  cityName: z.string().min(1).max(500),
  safetyNotes: z.array(z.string().max(500)).max(20),
}).strict();
export type OriginalBrief = z.infer<typeof originalBriefSchema>;
export type TranslatedFields = z.infer<typeof translatedFieldsSchema>;
export const MAX_TRANSLATION_INPUT_CHARACTERS = 1_200;

function providerFields(original: OriginalBrief): TranslatedFields {
  return {
    title: original.title,
    problemSummary: original.problemSummary,
    originalText: original.originalText,
    categoryName: original.categoryName,
    cityName: original.cityName,
    safetyNotes: original.safetyNotes,
  };
}

export function assertTranslationInput(original: OriginalBrief): void {
  const characterCount = Object.values(providerFields(original)).reduce(
    (total, value) => total + (Array.isArray(value) ? value.join('').length : value.length),
    0,
  );
  if (characterCount > MAX_TRANSLATION_INPUT_CHARACTERS) {
    throw new Error('TRANSLATION_INPUT_TOO_LARGE');
  }
}

const unitAndCurrencyTokens = new Set([
  'SAR',
  'USD',
  'ر.س',
  'ريال',
  'mm',
  'cm',
  'm',
  'km',
  'g',
  'kg',
  'ml',
  'l',
  'V',
  'W',
  'kW',
]);

function titleNameTokens(value: string): string[] {
  const tokens: string[] = [];
  for (
    const pattern of [
      /(?:^|\s)(?:from|by|for)\s+([\p{L}\p{M}][\p{L}\p{M}'’-]{1,50})/giu,
      /(?:^|\s)(?:من|بواسطة|لـ)\s+([\p{L}\p{M}][\p{L}\p{M}'’-]{1,50})/gu,
    ]
  ) {
    for (const match of value.matchAll(pattern)) {
      if (match[1]) tokens.push(match[1]);
    }
  }
  return tokens;
}

function protectedTokens(value: string, includeTitleNames = false): string[] {
  const numbers = value.match(/[\p{N}]+(?:[.,٫:/-][\p{N}]+)*/gu) ?? [];
  const identifiers = value.match(
    /(?=[\p{L}\p{N}._:/-]*\p{L})(?=[\p{L}\p{N}._:/-]*\p{N})[\p{L}\p{N}]+(?:[._:/-][\p{L}\p{N}]+)*/gu,
  ) ?? [];
  const units = (value.match(/[\p{L}\p{M}.]+/gu) ?? []).filter((token) =>
    unitAndCurrencyTokens.has(token)
  );
  return [
    ...new Set([
      ...numbers,
      ...identifiers,
      ...units,
      ...(includeTitleNames ? titleNameTokens(value) : []),
    ]),
  ];
}

function assertFieldTokens(source: string, translated: string, includeTitleNames = false): void {
  for (const token of protectedTokens(source, includeTitleNames)) {
    if (!translated.includes(token)) throw new Error('TRANSLATION_PROTECTED_TOKEN_MISMATCH');
  }
}

export function assertTranslationIntegrity(
  original: OriginalBrief,
  translated: TranslatedFields,
): void {
  if (
    translated.categoryName !== original.categoryName || translated.cityName !== original.cityName
  ) {
    throw new Error('TRANSLATION_IMMUTABLE_TERM_MISMATCH');
  }
  assertFieldTokens(original.title, translated.title, true);
  assertFieldTokens(original.problemSummary, translated.problemSummary);
  assertFieldTokens(original.originalText, translated.originalText);
  assertFieldTokens(original.safetyNotes.join('\n'), translated.safetyNotes.join('\n'));
}

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
    categoryName: original.categoryName,
    cityName: original.cityName,
    safetyNotes: original.safetyNotes.map((note) => `${prefix}: ${note}`),
  });
}
