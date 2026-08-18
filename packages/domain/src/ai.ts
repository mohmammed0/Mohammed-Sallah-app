import { aiDiagnosticSchema, type AiDiagnostic } from './schemas';

export interface DiagnosticContext {
  locale: string;
  messages: readonly { role: 'user' | 'assistant'; text: string }[];
  categoryHints: readonly string[];
  confirmedCategorySlug?: string | null;
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
    const enoughInformation = Boolean(
      confirmedCategory &&
      original.length >= 20 &&
      /today|tomorrow|schedule|اليوم|غد|موعد/i.test(original),
    );
    const allowSummary = enoughInformation || context.summaryRequested === true;
    return Promise.resolve(
      aiDiagnosticSchema.parse({
        schemaVersion: '1.0',
        suggestedCategorySlug: confirmedCategory,
        suggestedSubcategorySlug: null,
        confidence: 0.2,
        customerSummary: allowSummary ? original || 'Manual description required' : null,
        providerBrief: allowSummary ? original || 'Manual brief required' : null,
        observedSymptoms: [],
        possibleCauses: [],
        followUpQuestions: original
          ? ['Please confirm when the issue started and whether service is currently usable.']
          : ['Please describe the issue.'],
        safetyFlags,
        urgencySuggestion: safetyFlags.length > 0 ? 'safety_critical' : 'normal',
        recommendedCapabilities: [],
        tentativeToolsMaterials: [],
        missingInformation: ['category', 'preferred schedule'],
        enoughInformation,
        confirmationQuestion: 'Review and edit this draft before publishing.',
        metadata: {
          provider: this.name,
          model: this.model,
          promptVersion: 'diagnostic-v1',
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
