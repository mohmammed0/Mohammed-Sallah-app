import { aiDiagnosticSchema, type AiDiagnostic } from './schemas';

export interface DiagnosticContext {
  locale: string;
  messages: readonly { role: 'user' | 'assistant'; text: string }[];
  categoryHints: readonly string[];
  confirmedCategorySlug?: string | null;
  confirmedSubcategorySlug?: string | null;
  summaryRequested?: boolean;
}
export interface AiProvider {
  readonly name: string;
  readonly model: string;
  diagnose(context: DiagnosticContext): Promise<AiDiagnostic>;
}

const safetyPatterns: ReadonlyArray<[RegExp, AiDiagnostic['safetyFlags'][number]]> = [
  [/غاز|gas|تسرب/i, 'gas'],
  [/حريق|fire|دخان/i, 'fire'],
  [/سلك مكشوف|exposed wire/i, 'exposed_electricity'],
  [/ماء.*كهرب|water.*electric/i, 'water_near_electricity'],
  [/انهيار|collapse/i, 'structural'],
  [/محاصر|trapped/i, 'trapped_person'],
];

const fallbackConversation: Record<
  string,
  {
    describe: string;
    category: string;
    categoryChoices: readonly string[];
    schedule: string;
    scheduleChoices: readonly string[];
    confirmation: string;
  }
> = {
  ar: {
    describe: 'صف المشكلة التي تحتاج إلى صيانة.',
    category: 'ما نوع الخدمة الأقرب للمشكلة؟',
    categoryChoices: ['تكييف', 'سباكة', 'كهرباء', 'لست متأكدًا'],
    schedule: 'متى تفضّل تنفيذ الخدمة؟',
    scheduleChoices: ['اليوم', 'غدًا', 'الوقت مرن'],
    confirmation: 'راجع المسودة وعدّلها قبل النشر.',
  },
  en: {
    describe: 'Describe the issue that needs service.',
    category: 'Which service type best matches the issue?',
    categoryChoices: ['Air conditioning', 'Plumbing', 'Electrical', 'Not sure'],
    schedule: 'When would you prefer the service?',
    scheduleChoices: ['Today', 'Tomorrow', 'My timing is flexible'],
    confirmation: 'Review and edit this draft before publishing.',
  },
  ur: {
    describe: 'اس مسئلے کی وضاحت کریں جس کی مرمت درکار ہے۔',
    category: 'کون سی سروس اس مسئلے سے زیادہ مطابقت رکھتی ہے؟',
    categoryChoices: ['ایئر کنڈیشننگ', 'پلمبنگ', 'بجلی', 'یقین نہیں'],
    schedule: 'آپ سروس کب چاہتے ہیں؟',
    scheduleChoices: ['آج', 'کل', 'وقت لچکدار ہے'],
    confirmation: 'شائع کرنے سے پہلے مسودے کا جائزہ لیں اور ترمیم کریں۔',
  },
  hi: {
    describe: 'जिस समस्या के लिए सेवा चाहिए उसका वर्णन करें।',
    category: 'कौन-सी सेवा इस समस्या से सबसे अधिक मेल खाती है?',
    categoryChoices: ['एयर कंडीशनिंग', 'प्लंबिंग', 'बिजली', 'पक्का नहीं'],
    schedule: 'आप सेवा कब चाहते हैं?',
    scheduleChoices: ['आज', 'कल', 'समय लचीला है'],
    confirmation: 'प्रकाशित करने से पहले मसौदे की समीक्षा और संपादन करें।',
  },
};

export class DeterministicAiProvider implements AiProvider {
  readonly name = 'deterministic';
  readonly model = 'rules-v1';
  diagnose(context: DiagnosticContext): Promise<AiDiagnostic> {
    const original = context.messages
      .filter((message) => message.role === 'user')
      .map((message) => message.text)
      .join('\n')
      .slice(0, 4000);
    const safetyFlags = safetyPatterns
      .filter(([pattern]) => pattern.test(original))
      .map(([, flag]) => flag);
    const confirmedCategory = context.confirmedCategorySlug ?? null;
    const localized = fallbackConversation[context.locale] ?? fallbackConversation.en!;
    const hasSchedule =
      /today|tomorrow|schedule|flexible|اليوم|غد|موعد|مرن|آج|کل|لچکدار|आज|कल|लचीला/i.test(original);
    const enoughInformation = Boolean(confirmedCategory && original.length >= 20 && hasSchedule);
    const allowSummary = enoughInformation || context.summaryRequested === true;
    const nextQuestion = !original
      ? localized.describe
      : !confirmedCategory
        ? localized.category
        : !hasSchedule
          ? localized.schedule
          : null;
    const quickReplies = !original
      ? []
      : !confirmedCategory
        ? localized.categoryChoices
        : !hasSchedule
          ? localized.scheduleChoices
          : [];
    return Promise.resolve(
      aiDiagnosticSchema.parse({
        schemaVersion: '1.0',
        suggestedCategorySlug: confirmedCategory,
        suggestedSubcategorySlug: context.confirmedSubcategorySlug ?? null,
        confidence: 0.2,
        customerSummary: allowSummary ? original || 'Manual description required' : null,
        providerBrief: allowSummary ? original || 'Manual brief required' : null,
        observedSymptoms: [],
        possibleCauses: [],
        followUpQuestions: nextQuestion ? [nextQuestion] : [],
        quickReplies,
        safetyFlags,
        urgencySuggestion: safetyFlags.length > 0 ? 'safety_critical' : 'normal',
        recommendedCapabilities: [],
        tentativeToolsMaterials: [],
        missingInformation: [
          ...(!confirmedCategory ? ['category'] : []),
          ...(!hasSchedule ? ['preferred schedule'] : []),
        ],
        enoughInformation,
        confirmationQuestion: localized.confirmation,
        metadata: {
          provider: this.name,
          model: this.model,
          promptVersion: 'diagnostic-v4',
          fallback: true,
          historyPreserved: true,
          categoryConfirmed: Boolean(context.confirmedCategorySlug),
        },
      }),
    );
  }
}

export async function diagnoseWithFallback(
  primary: AiProvider,
  fallback: AiProvider,
  context: DiagnosticContext,
): Promise<AiDiagnostic> {
  try {
    return aiDiagnosticSchema.parse(await primary.diagnose(context));
  } catch {
    return aiDiagnosticSchema.parse(await fallback.diagnose(context));
  }
}
