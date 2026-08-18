import { z } from 'npm:zod@4.4.3';
export const inputSchema = z.object({
  locale: z.enum(['ar', 'en', 'ur', 'hi']).default('ar'),
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().min(1).max(8000) }))
    .min(1)
    .max(100),
  categoryHints: z.array(z.string()).max(100).default([]),
});
export const diagnosticSchema = z.object({
  schemaVersion: z.literal('1.0'),
  suggestedCategorySlug: z.string().nullable(),
  suggestedSubcategorySlug: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  customerSummary: z.string().min(1).max(4000),
  providerBrief: z.string().min(1).max(4000),
  observedSymptoms: z.array(z.string()).max(30),
  possibleCauses: z.array(z.string()).max(20),
  followUpQuestions: z.array(z.string()).max(5),
  safetyFlags: z
    .array(
      z.enum([
        'gas',
        'fire',
        'exposed_electricity',
        'water_near_electricity',
        'structural',
        'trapped_person',
        'other',
      ]),
    )
    .max(10),
  urgencySuggestion: z.enum(['flexible', 'normal', 'urgent', 'safety_critical']),
  recommendedCapabilities: z.array(z.string()).max(20),
  tentativeToolsMaterials: z.array(z.string()).max(30),
  missingInformation: z.array(z.string()).max(20),
  enoughInformation: z.boolean(),
  confirmationQuestion: z.string().min(1).max(500),
  metadata: z.object({
    provider: z.string(),
    model: z.string(),
    promptVersion: z.string(),
    fallback: z.boolean(),
  }),
});
export type Diagnostic = z.infer<typeof diagnosticSchema>;
export const jsonSchema = {
  type: 'object',
  additionalProperties: false,
  required: [
    'schemaVersion',
    'suggestedCategorySlug',
    'suggestedSubcategorySlug',
    'confidence',
    'customerSummary',
    'providerBrief',
    'observedSymptoms',
    'possibleCauses',
    'followUpQuestions',
    'safetyFlags',
    'urgencySuggestion',
    'recommendedCapabilities',
    'tentativeToolsMaterials',
    'missingInformation',
    'enoughInformation',
    'confirmationQuestion',
    'metadata',
  ],
  properties: {
    schemaVersion: { type: 'string', enum: ['1.0'] },
    suggestedCategorySlug: { type: ['string', 'null'] },
    suggestedSubcategorySlug: { type: ['string', 'null'] },
    confidence: { type: 'number', minimum: 0, maximum: 1 },
    customerSummary: { type: 'string' },
    providerBrief: { type: 'string' },
    observedSymptoms: { type: 'array', items: { type: 'string' } },
    possibleCauses: { type: 'array', items: { type: 'string' } },
    followUpQuestions: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    safetyFlags: {
      type: 'array',
      items: {
        type: 'string',
        enum: [
          'gas',
          'fire',
          'exposed_electricity',
          'water_near_electricity',
          'structural',
          'trapped_person',
          'other',
        ],
      },
    },
    urgencySuggestion: {
      type: 'string',
      enum: ['flexible', 'normal', 'urgent', 'safety_critical'],
    },
    recommendedCapabilities: { type: 'array', items: { type: 'string' } },
    tentativeToolsMaterials: { type: 'array', items: { type: 'string' } },
    missingInformation: { type: 'array', items: { type: 'string' } },
    enoughInformation: { type: 'boolean' },
    confirmationQuestion: { type: 'string' },
    metadata: {
      type: 'object',
      additionalProperties: false,
      required: ['provider', 'model', 'promptVersion', 'fallback'],
      properties: {
        provider: { type: 'string' },
        model: { type: 'string' },
        promptVersion: { type: 'string' },
        fallback: { type: 'boolean' },
      },
    },
  },
};
const patterns: [RegExp, Diagnostic['safetyFlags'][number]][] = [
  [/غاز|gas|تسرب/i, 'gas'],
  [/حريق|fire|دخان/i, 'fire'],
  [/سلك مكشوف|exposed wire/i, 'exposed_electricity'],
  [/ماء.*كهرب|water.*electric/i, 'water_near_electricity'],
  [/انهيار|collapse/i, 'structural'],
  [/محاصر|trapped/i, 'trapped_person'],
];
export function deterministic(input: z.infer<typeof inputSchema>): Diagnostic {
  const text = input.messages
    .filter((m) => m.role === 'user')
    .map((m) => m.text)
    .join('\n')
    .slice(0, 4000);
  const safetyFlags = patterns.filter(([p]) => p.test(text)).map(([, f]) => f);
  return diagnosticSchema.parse({
    schemaVersion: '1.0',
    suggestedCategorySlug: null,
    suggestedSubcategorySlug: null,
    confidence: 0.2,
    customerSummary: text || 'Manual description required',
    providerBrief: text || 'Manual brief required',
    observedSymptoms: [],
    possibleCauses: [],
    followUpQuestions: text
      ? ['Please confirm when the issue started and whether the service is currently usable.']
      : ['Please describe the issue.'],
    safetyFlags,
    urgencySuggestion: safetyFlags.length ? 'safety_critical' : 'normal',
    recommendedCapabilities: [],
    tentativeToolsMaterials: [],
    missingInformation: ['category', 'schedule'],
    enoughInformation: false,
    confirmationQuestion: 'Review and edit every field before publishing.',
    metadata: {
      provider: 'deterministic',
      model: 'rules-v1',
      promptVersion: 'diagnostic-v1',
      fallback: true,
    },
  });
}
