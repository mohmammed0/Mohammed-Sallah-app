import {
  deterministicTestTranslation,
  originalBriefSchema,
  protectedBriefFields,
  translatedFieldsSchema,
} from './translation.ts';

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
const original = originalBriefSchema.parse({
  title: 'عطل تكييف',
  problemSummary: 'الوحدة لا تبرد',
  originalText: 'المكيف لا يبرد منذ أمس',
  categoryName: 'التكييف',
  categorySlug: 'ac-hvac',
  cityName: 'الرياض',
  cityCode: 'riyadh',
  districtId: null,
  urgency: 'normal',
  requestedStart: '2026-08-18T10:00:00.000Z',
  timingMode: 'scheduled',
  requestVersion: 3,
  safetyNotes: [],
});

Deno.test('local translation test provider is schema-valid and visibly marked', () => {
  const translated = deterministicTestTranslation(original, 'ur');
  assert(translatedFieldsSchema.safeParse(translated).success, 'translated fields must validate');
  assert(translated.title.includes('آزمائشی'), 'test provider must be visibly marked');
});

Deno.test('translation cannot alter protected marketplace fields', () => {
  const protectedFields = protectedBriefFields(original);
  assert(protectedFields.categorySlug === 'ac-hvac', 'category identifier must remain original');
  assert(protectedFields.urgency === 'normal', 'urgency must remain original');
  assert(protectedFields.requestVersion === 3, 'request version must remain original');
  assert(protectedFields.timingMode === 'scheduled', 'timing semantics must remain original');
});
