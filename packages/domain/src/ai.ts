import { aiDiagnosticSchema, type AiDiagnostic } from './schemas';

export interface DiagnosticContext {
  locale: string;
  messages: readonly { role: 'user' | 'assistant'; text: string }[];
  categoryHints: readonly string[];
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
    return Promise.resolve(
      aiDiagnosticSchema.parse({
        schemaVersion: '1.0',
        suggestedCategorySlug: null,
        suggestedSubcategorySlug: null,
        confidence: 0.2,
        customerSummary: original || 'Manual description required',
        providerBrief: original || 'Manual brief required',
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
        enoughInformation: false,
        confirmationQuestion: 'Review and edit this draft before publishing.',
        metadata: {
          provider: this.name,
          model: this.model,
          promptVersion: 'diagnostic-v1',
          fallback: true,
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
