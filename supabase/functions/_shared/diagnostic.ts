import { z } from 'npm:zod@4.4.3';
const diagnosticSlug = z.string().regex(/^[a-z0-9][a-z0-9-]{0,119}$/u);
export const MAX_DIAGNOSTIC_MESSAGES = 40;
const messagesSchema = z
  .array(z.object({ role: z.enum(['user', 'assistant']), text: z.string().min(1).max(8000) }))
  .min(1)
  .max(MAX_DIAGNOSTIC_MESSAGES)
  .superRefine((messages, context) => {
    if (messages.reduce((total, message) => total + message.text.length, 0) > 32_000) {
      context.addIssue({ code: 'custom', message: 'diagnostic conversation is too large' });
    }
  });
export const inputSchema = z.object({
  locale: z.enum(['ar', 'en', 'ur', 'hi']).default('ar'),
  messages: messagesSchema,
  categoryHints: z.array(diagnosticSlug).max(100).default([]),
  sessionId: z.uuid().optional(),
  clientMessageId: z.string().min(8).max(128).optional(),
  inputKind: z.enum(['text', 'voice', 'image']).default('text'),
  mediaUploadIds: z.array(z.uuid()).max(4).refine((ids) => new Set(ids).size === ids.length, {
    message: 'duplicate media upload ids',
  }).default([]),
  confirmedCategorySlug: diagnosticSlug.nullable().optional(),
  confirmedSubcategorySlug: diagnosticSlug.nullable().optional(),
  summaryRequested: z.boolean().default(false),
});
export const diagnosticSchema = z.object({
  schemaVersion: z.literal('1.0'),
  suggestedCategorySlug: z.string().nullable(),
  suggestedSubcategorySlug: z.string().nullable(),
  confidence: z.number().min(0).max(1),
  customerSummary: z.string().min(1).max(4000).nullable(),
  providerBrief: z.string().min(1).max(4000).nullable(),
  observedSymptoms: z.array(z.string()).max(30),
  possibleCauses: z.array(z.string()).max(20),
  followUpQuestions: z.array(z.string()).max(5),
  quickReplies: z.array(z.string().min(1).max(120)).max(4).default([]),
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
    sessionId: z.uuid().optional(),
    turnNumber: z.number().int().positive().optional(),
    historyPreserved: z.boolean().default(true),
    categoryConfirmed: z.boolean().default(false),
    visionInputCount: z.number().int().min(0).max(4).optional(),
    visionMode: z.enum(['not_requested', 'provider', 'text_fallback']).optional(),
    summaryRequested: z.boolean().optional(),
    providerAttempts: z.number().int().min(1).max(2).optional(),
    providerInputUnits: z.number().int().min(0).optional(),
    providerOutputUnits: z.number().int().min(0).optional(),
  }),
});
export const providerDiagnosticSchema = diagnosticSchema.omit({ metadata: true }).strict();
export type Diagnostic = z.infer<typeof diagnosticSchema>;

export function assertCanAppendDiagnosticTurn(messageCount: number): void {
  if (
    !Number.isInteger(messageCount) || messageCount < 0 ||
    messageCount > MAX_DIAGNOSTIC_MESSAGES - 2
  ) {
    throw new Error('AI_CONVERSATION_LIMIT_REACHED');
  }
}
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
    'quickReplies',
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
    customerSummary: { type: ['string', 'null'] },
    providerBrief: { type: ['string', 'null'] },
    observedSymptoms: { type: 'array', items: { type: 'string' } },
    possibleCauses: { type: 'array', items: { type: 'string' } },
    followUpQuestions: { type: 'array', items: { type: 'string' }, maxItems: 5 },
    quickReplies: { type: 'array', items: { type: 'string' }, maxItems: 4 },
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
      required: [
        'provider',
        'model',
        'promptVersion',
        'fallback',
        'historyPreserved',
        'categoryConfirmed',
      ],
      properties: {
        provider: { type: 'string' },
        model: { type: 'string' },
        promptVersion: { type: 'string' },
        fallback: { type: 'boolean' },
        sessionId: { type: 'string', format: 'uuid' },
        turnNumber: { type: 'integer', minimum: 1 },
        historyPreserved: { type: 'boolean' },
        categoryConfirmed: { type: 'boolean' },
        visionInputCount: { type: 'integer', minimum: 0, maximum: 4 },
        visionMode: {
          type: 'string',
          enum: ['not_requested', 'provider', 'text_fallback'],
        },
        summaryRequested: { type: 'boolean' },
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
  const confirmedCategory = input.confirmedCategorySlug ??
    input.categoryHints.find((hint) =>
      text.toLocaleLowerCase().includes(hint.toLocaleLowerCase())
    ) ??
    null;
  const hasDescription = text.trim().length >= 20;
  const hasSchedule =
    /اليوم|غد|موعد|صباح|مساء|today|tomorrow|schedule|morning|evening|\d{1,2}[:٫]\d{2}/i
      .test(text);
  const hasLocation = /حي|مدينة|الرياض|جدة|الدمام|district|city|riyadh|jeddah|dammam/i.test(text);
  const missingInformation = [
    ...(!confirmedCategory ? ['category'] : []),
    ...(!hasDescription ? ['description'] : []),
    ...(!hasSchedule ? ['schedule'] : []),
    ...(!hasLocation ? ['area'] : []),
  ];
  const enoughInformation = missingInformation.length === 0;
  const previousAssistantText = input.messages
    .filter((message) => message.role === 'assistant')
    .map((message) => message.text.toLocaleLowerCase())
    .join('\n');
  const localizedQuestions: Record<typeof input.locale, Record<string, string>> = {
    ar: {
      category: 'يرجى تأكيد فئة الخدمة.',
      description: 'صف ما حدث وما تلاحظه ومتى بدأت المشكلة.',
      schedule: 'ما التاريخ والفترة الزمنية المناسبة للزيارة؟',
      area: 'في أي مدينة وحي تحتاج الخدمة؟',
    },
    en: {
      category: 'Please confirm the service category.',
      description: 'Please describe what happened, what you observe, and when it started.',
      schedule: 'What date and time window works for the visit?',
      area: 'Which city and district is the service needed in?',
    },
    ur: {
      category: 'براہ کرم سروس کی قسم کی تصدیق کریں۔',
      description: 'بتائیں کیا ہوا، آپ کیا دیکھ رہے ہیں، اور مسئلہ کب شروع ہوا۔',
      schedule: 'دورے کے لیے کون سی تاریخ اور وقت مناسب ہے؟',
      area: 'کس شہر اور علاقے میں سروس درکار ہے؟',
    },
    hi: {
      category: 'कृपया सेवा श्रेणी की पुष्टि करें।',
      description: 'बताएं कि क्या हुआ, आप क्या देख रहे हैं और समस्या कब शुरू हुई।',
      schedule: 'मुलाकात के लिए कौन-सी तारीख और समय उपयुक्त है?',
      area: 'किस शहर और क्षेत्र में सेवा चाहिए?',
    },
  };
  const questions = localizedQuestions[input.locale];
  const nextField = missingInformation.find((field) => {
    const question = questions[field];
    return question && !previousAssistantText.includes(question.toLocaleLowerCase());
  });
  const nextQuestion = nextField ? questions[nextField] : undefined;
  const localizedQuickReplies: Record<typeof input.locale, Record<string, string[]>> = {
    ar: {
      category: ['تكييف', 'سباكة', 'كهرباء', 'لست متأكدًا'],
      description: ['لا تعمل نهائيًا', 'تعمل بشكل متقطع', 'يوجد صوت أو تسرب', 'لست متأكدًا'],
      schedule: ['اليوم', 'غدًا', 'الوقت مرن'],
      area: ['الرياض', 'جدة', 'الدمام'],
    },
    en: {
      category: ['Air conditioning', 'Plumbing', 'Electrical', 'Not sure'],
      description: ['Stopped completely', 'Works intermittently', 'Noise or leak', 'Not sure'],
      schedule: ['Today', 'Tomorrow', 'My timing is flexible'],
      area: ['Riyadh', 'Jeddah', 'Dammam'],
    },
    ur: {
      category: ['ایئر کنڈیشننگ', 'پلمبنگ', 'بجلی', 'یقین نہیں'],
      description: ['بالکل کام نہیں کرتا', 'کبھی کبھی کام کرتا ہے', 'آواز یا رساؤ ہے', 'یقین نہیں'],
      schedule: ['آج', 'کل', 'وقت لچکدار ہے'],
      area: ['ریاض', 'جدہ', 'دمام'],
    },
    hi: {
      category: ['एयर कंडीशनिंग', 'प्लंबिंग', 'बिजली', 'पक्का नहीं'],
      description: ['बिल्कुल काम नहीं करता', 'रुक-रुक कर चलता है', 'आवाज़ या रिसाव है', 'पक्का नहीं'],
      schedule: ['आज', 'कल', 'समय लचीला है'],
      area: ['रियाद', 'जेद्दा', 'दम्माम'],
    },
  };
  const allowSummary = enoughInformation || input.summaryRequested;
  return diagnosticSchema.parse({
    schemaVersion: '1.0',
    suggestedCategorySlug: confirmedCategory,
    suggestedSubcategorySlug: null,
    confidence: confirmedCategory ? 0.6 : 0.2,
    customerSummary: allowSummary ? (text || 'Manual description required') : null,
    providerBrief: allowSummary ? (text || 'Manual brief required') : null,
    observedSymptoms: [],
    possibleCauses: [],
    followUpQuestions: nextQuestion ? [nextQuestion] : [],
    quickReplies: nextField ? (localizedQuickReplies[input.locale][nextField] ?? []) : [],
    safetyFlags,
    urgencySuggestion: safetyFlags.length ? 'safety_critical' : 'normal',
    recommendedCapabilities: [],
    tentativeToolsMaterials: [],
    missingInformation,
    enoughInformation,
    confirmationQuestion: input.locale === 'ar'
      ? 'راجع كل حقل وعدّله قبل النشر.'
      : input.locale === 'ur'
      ? 'شائع کرنے سے پہلے ہر فیلڈ کا جائزہ لیں اور اس میں ترمیم کریں۔'
      : input.locale === 'hi'
      ? 'प्रकाशित करने से पहले हर फ़ील्ड की समीक्षा और संपादन करें।'
      : 'Review and edit every field before publishing.',
    metadata: {
      provider: 'deterministic',
      model: 'rules-v1',
      promptVersion: 'diagnostic-v4',
      fallback: true,
      historyPreserved: true,
      categoryConfirmed: input.confirmedCategorySlug !== undefined &&
        input.confirmedCategorySlug !== null,
      sessionId: input.sessionId,
      turnNumber: input.messages.filter((message) => message.role === 'user').length,
    },
  });
}
