import { diagnosticSchema, inputSchema } from '../_shared/diagnostic.ts';

type BlockerKind = 'RUNTIME_BLOCKED' | 'PROVIDER_BLOCKED';

class CanaryBlocked extends Error {
  constructor(readonly kind: BlockerKind, readonly code: string) {
    super(code);
    this.name = 'CanaryBlocked';
  }
}

function requiredEnvironment(name: string): string {
  const value = Deno.env.get(name)?.trim();
  if (!value) throw new CanaryBlocked('RUNTIME_BLOCKED', 'CANARY_ENVIRONMENT_MISSING');
  return value;
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null ? value as Record<string, unknown> : null;
}

async function responseRecord(response: Response): Promise<Record<string, unknown> | null> {
  try {
    return record(await response.json());
  } catch {
    return null;
  }
}

function accessToken(payload: Record<string, unknown> | null): string | null {
  if (typeof payload?.access_token === 'string') return payload.access_token;
  const session = record(payload?.session);
  return typeof session?.access_token === 'string' ? session.access_token : null;
}

function safeServerCode(payload: Record<string, unknown> | null): string | null {
  const code = payload?.code;
  return typeof code === 'string' && /^[A-Z0-9_]{3,80}$/u.test(code) ? code : null;
}

function classifyFunctionFailure(status: number, payload: Record<string, unknown> | null): never {
  const code = safeServerCode(payload);
  if (code?.startsWith('OPENAI_')) throw new CanaryBlocked('PROVIDER_BLOCKED', code);
  if (status === 401 || status === 403) {
    throw new CanaryBlocked('RUNTIME_BLOCKED', 'PREVIEW_AUTHENTICATION_FAILED');
  }
  throw new CanaryBlocked(
    'RUNTIME_BLOCKED',
    code ?? (status >= 500 ? 'PREVIEW_FUNCTION_UNAVAILABLE' : 'PREVIEW_FUNCTION_REJECTED'),
  );
}

async function main(): Promise<void> {
  const projectRef = requiredEnvironment('SALLAH_PREVIEW_PROJECT_REF');
  const previewUrl = new URL(requiredEnvironment('SALLAH_PREVIEW_URL'));
  if (
    !/^[a-z]{20}$/u.test(projectRef) ||
    previewUrl.origin !== `https://${projectRef}.supabase.co`
  ) {
    throw new CanaryBlocked('RUNTIME_BLOCKED', 'PREVIEW_PROJECT_MISMATCH');
  }

  const publishableKey = requiredEnvironment('SALLAH_PREVIEW_PUBLISHABLE_KEY');
  const email = requiredEnvironment('SALLAH_CANARY_EMAIL');
  const password = requiredEnvironment('SALLAH_CANARY_PASSWORD');
  const clientMessageId = requiredEnvironment('SALLAH_CANARY_CLIENT_MESSAGE_ID');

  let signupResponse: Response;
  try {
    signupResponse = await fetch(new URL('/auth/v1/signup', previewUrl), {
      method: 'POST',
      headers: { apikey: publishableKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new CanaryBlocked('RUNTIME_BLOCKED', 'PREVIEW_AUTH_SETUP_UNREACHABLE');
  }
  const signupPayload = await responseRecord(signupResponse);
  if (!signupResponse.ok) {
    throw new CanaryBlocked('RUNTIME_BLOCKED', 'PREVIEW_AUTH_SETUP_FAILED');
  }
  const token = accessToken(signupPayload);
  if (!token) {
    throw new CanaryBlocked('RUNTIME_BLOCKED', 'PREVIEW_AUTH_SESSION_UNAVAILABLE');
  }

  const requestBody = inputSchema.parse({
    locale: 'ar',
    messages: [{
      role: 'user',
      text:
        'هناك تسرب ماء بسيط تحت مغسلة المطبخ منذ اليوم في حي تجريبي بالرياض، وأحتاج زيارة غدًا مساءً.',
    }],
    categoryHints: ['plumbing'],
    confirmedCategorySlug: 'plumbing',
    confirmedSubcategorySlug: null,
    clientMessageId,
    inputKind: 'text',
    mediaUploadIds: [],
    summaryRequested: true,
  });

  let diagnosticResponse: Response;
  try {
    // Deliberately one invocation: this runner never retries the diagnostic canary.
    diagnosticResponse = await fetch(new URL('/functions/v1/ai-diagnostic', previewUrl), {
      method: 'POST',
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(45_000),
    });
  } catch {
    throw new CanaryBlocked('RUNTIME_BLOCKED', 'PREVIEW_DIAGNOSTIC_UNREACHABLE');
  }
  const diagnosticPayload = await responseRecord(diagnosticResponse);
  if (!diagnosticResponse.ok) {
    classifyFunctionFailure(diagnosticResponse.status, diagnosticPayload);
  }

  const parsed = diagnosticSchema.safeParse(diagnosticPayload);
  if (!parsed.success) {
    throw new CanaryBlocked('RUNTIME_BLOCKED', 'STRUCTURED_DIAGNOSTIC_INVALID');
  }
  const result = parsed.data;
  const ArabicText = [
    result.customerSummary,
    result.providerBrief,
    result.confirmationQuestion,
    ...result.followUpQuestions,
  ].filter((value): value is string => typeof value === 'string').join(' ');
  const attempts = result.metadata.providerAttempts;
  const inputUnits = result.metadata.providerInputUnits;
  const outputUnits = result.metadata.providerOutputUnits;
  if (
    result.metadata.provider !== 'openai' ||
    result.metadata.fallback !== false ||
    /deterministic|local|mock|rules-v1/iu.test(result.metadata.model)
  ) {
    throw new CanaryBlocked('RUNTIME_BLOCKED', 'OPENAI_PROVIDER_NOT_ACTIVE');
  }
  if (
    result.metadata.promptVersion !== 'diagnostic-v4' ||
    result.metadata.categoryConfirmed !== true ||
    result.metadata.visionMode !== 'not_requested' ||
    result.suggestedCategorySlug !== 'plumbing'
  ) {
    throw new CanaryBlocked('RUNTIME_BLOCKED', 'DIAGNOSTIC_CONTRACT_MISMATCH');
  }
  if (
    !Number.isInteger(attempts) || attempts! < 1 || attempts! > 2 ||
    !Number.isInteger(inputUnits) || inputUnits! < 1 ||
    !Number.isInteger(outputUnits) || outputUnits! < 1
  ) {
    throw new CanaryBlocked('RUNTIME_BLOCKED', 'OPENAI_USAGE_EVIDENCE_MISSING');
  }
  if (!/[\u0600-\u06ff]/u.test(ArabicText)) {
    throw new CanaryBlocked('PROVIDER_BLOCKED', 'OPENAI_ARABIC_OUTPUT_INVALID');
  }

  console.log('CANARY_PASS');
}

try {
  await main();
} catch (error) {
  if (error instanceof CanaryBlocked) {
    console.log(`${error.kind}:${error.code}`);
  } else {
    console.log('RUNTIME_BLOCKED:CANARY_RUNNER_UNEXPECTED');
  }
  Deno.exit(1);
}
