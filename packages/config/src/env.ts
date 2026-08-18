import { z } from 'zod';

export const appEnvironmentSchema = z.enum(['local', 'test', 'preview', 'production']);

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');
const url = z.url();

export const publicEnvironmentSchema = z.object({
  APP_ENV: appEnvironmentSchema.default('local'),
  SUPABASE_URL: url,
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export const serverEnvironmentSchema = publicEnvironmentSchema.extend({
  SUPABASE_SECRET_KEY: z.string().optional(),
  AI_PROVIDER: z
    .enum(['deterministic', 'openai', 'gemini', 'compatible', 'ollama'])
    .default('deterministic'),
  AI_MODEL: z.string().min(1).default('gpt-5.4-nano'),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  AI_COMPATIBLE_BASE_URL: url.optional(),
  AI_DAILY_BUDGET_MINOR: z.coerce.number().int().nonnegative().default(0),
  PAYMENT_PROVIDER: z.enum(['offline', 'fake', 'sandbox', 'gateway']).default('offline'),
  PUSH_ENABLED: booleanString.default(false),
  EXPO_ACCESS_TOKEN: z.string().optional(),
  ADMIN_BOOTSTRAP_EMAIL: z.email().optional(),
  UPLOAD_SCANNER_MODE: z.enum(['deterministic', 'external']).default('deterministic'),
  UPLOAD_SCANNER_URL: url.optional(),
  UPLOAD_SCANNER_SECRET: z.string().min(24).optional(),
  SALLAH_PUBLIC_URL: url,
  SALLAH_SUPPORT_EMAIL: z.email(),
});

export type AppEnvironment = z.infer<typeof appEnvironmentSchema>;
export type ServerEnvironment = z.infer<typeof serverEnvironmentSchema>;

export function validateServerEnvironment(
  input: Record<string, string | undefined>,
): ServerEnvironment {
  const parsed = serverEnvironmentSchema.safeParse(input);
  if (!parsed.success) {
    throw new Error(`Invalid environment: ${z.prettifyError(parsed.error)}`);
  }
  const env = parsed.data;
  if (env.APP_ENV === 'production') {
    const missing: string[] = [];
    if (!env.SUPABASE_SECRET_KEY) missing.push('SUPABASE_SECRET_KEY');
    if (env.AI_PROVIDER === 'openai' && !env.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
    if (env.AI_PROVIDER === 'gemini' && !env.GEMINI_API_KEY) missing.push('GEMINI_API_KEY');
    if (env.PAYMENT_PROVIDER === 'fake' || env.PAYMENT_PROVIDER === 'sandbox') {
      throw new Error('Fake and sandbox payment providers are forbidden in production');
    }
    if (env.AI_PROVIDER === 'deterministic') {
      throw new Error(
        'Deterministic AI is test/local-only; use a real provider or disable AI in production',
      );
    }
    if (env.UPLOAD_SCANNER_MODE !== 'external') {
      throw new Error(
        'Deterministic upload scanning is test/local-only; external scanning is required in production',
      );
    }
    if (!env.UPLOAD_SCANNER_URL) missing.push('UPLOAD_SCANNER_URL');
    if (!env.UPLOAD_SCANNER_SECRET) missing.push('UPLOAD_SCANNER_SECRET');
    if (env.PUSH_ENABLED && !env.EXPO_ACCESS_TOKEN) missing.push('EXPO_ACCESS_TOKEN');
    if (missing.length > 0) throw new Error(`Missing production variables: ${missing.join(', ')}`);
  }
  return env;
}
