import { z } from 'zod';

export const appEnvironmentSchema = z.enum(['local', 'test', 'preview', 'production']);

const booleanString = z.enum(['true', 'false']).transform((value) => value === 'true');
const url = z.url();
const scannerSecret = (name: string) =>
  z.string().superRefine((value, context) => {
    const bytes = new TextEncoder().encode(value).byteLength;
    if (bytes < 32 || bytes > 256) {
      context.addIssue({
        code: 'custom',
        message: `${name} must contain 32-256 UTF-8 bytes`,
      });
    }
  });

function validateMediaOrigin(value: string, allowLocalHttp: boolean): void {
  const message =
    'SALLAH_SUPABASE_PUBLIC_URL must be an exact HTTPS root origin; HTTP is local/test loopback-only';
  const hasControlCharacter = Array.from(value).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 0x20 || (code >= 0x7f && code <= 0x9f);
  });
  if (!/^https?:\/\/[^/?#@\\\s]+\/?$/iu.test(value) || hasControlCharacter) {
    throw new Error(message);
  }
  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw new Error(message);
  }
  const localHost = ['127.0.0.1', 'localhost', '[::1]', '10.0.2.2'].includes(origin.hostname);
  if (
    (origin.protocol !== 'https:' &&
      !(allowLocalHttp && origin.protocol === 'http:' && localHost)) ||
    (!allowLocalHttp && localHost) ||
    origin.username !== '' ||
    origin.password !== '' ||
    origin.pathname !== '/' ||
    origin.search !== '' ||
    origin.hash !== '' ||
    origin.port === '0'
  ) {
    throw new Error(message);
  }
}

function validateScannerOrigin(value: string, name: string, allowLocalHttp: boolean): void {
  let origin: URL;
  try {
    origin = new URL(value);
  } catch {
    throw new Error(`${name} must be an exact scanner origin`);
  }
  const hostname = origin.hostname
    .toLowerCase()
    .replace(/^\[|\]$/gu, '')
    .replace(/\.$/u, '');
  const protocolAllowed =
    origin.protocol === 'https:' || (allowLocalHttp && origin.protocol === 'http:');
  if (
    !protocolAllowed ||
    origin.username !== '' ||
    origin.password !== '' ||
    origin.pathname !== '/' ||
    origin.search !== '' ||
    origin.hash !== '' ||
    (!allowLocalHttp && origin.port !== '') ||
    (!allowLocalHttp && (/^\d{1,3}(?:\.\d{1,3}){3}$/u.test(hostname) || hostname.includes(':')))
  ) {
    throw new Error(
      `${name} must be an exact HTTPS default-port DNS origin without credentials, path, query, fragment, or IP literal`,
    );
  }
}

export const publicEnvironmentSchema = z.object({
  APP_ENV: appEnvironmentSchema,
  SUPABASE_URL: url,
  SUPABASE_PUBLISHABLE_KEY: z.string().min(1),
});

export const serverEnvironmentSchema = publicEnvironmentSchema.extend({
  SUPABASE_SECRET_KEY: z.string().optional(),
  SALLAH_SUPABASE_PUBLIC_URL: z.string().optional(),
  AI_PROVIDER: z
    .enum(['deterministic', 'openai', 'gemini', 'compatible', 'ollama'])
    .default('deterministic'),
  OPENAI_DIAGNOSTIC_MODEL: z.string().min(1).default('gpt-5.6-terra'),
  OPENAI_DIAGNOSTIC_SUPPORTS_IMAGES: booleanString.default(false),
  TRANSLATION_PROVIDER: z.enum(['disabled', 'deterministic', 'openai']).default('disabled'),
  OPENAI_TRANSLATION_MODEL: z.string().min(1).default('gpt-5.6-luna'),
  TRANSCRIPTION_PROVIDER: z.enum(['disabled', 'openai']).default('disabled'),
  OPENAI_TRANSCRIPTION_MODEL: z.string().min(1).default('gpt-transcribe'),
  OPENAI_API_KEY: z.string().optional(),
  GEMINI_API_KEY: z.string().optional(),
  AI_COMPATIBLE_BASE_URL: url.optional(),
  PAYMENT_PROVIDER: z.enum(['offline', 'fake', 'sandbox', 'gateway']).default('offline'),
  PUSH_ENABLED: booleanString.default(false),
  EXPO_ACCESS_TOKEN: z.string().min(16).max(512).optional(),
  PUSH_TOKEN_ENCRYPTION_KEY: z
    .string()
    .regex(/^[A-Za-z0-9_-]{43}$/u)
    .optional(),
  NOTIFICATION_WORKER_SECRET: scannerSecret('NOTIFICATION_WORKER_SECRET').optional(),
  ADMIN_BOOTSTRAP_EMAIL: z.email().optional(),
  UPLOAD_SCANNER_MODE: z.enum(['deterministic', 'external']),
  UPLOAD_SCANNER_CONTROL_ORIGIN: z.string().min(1).optional(),
  UPLOAD_SCANNER_STORAGE_ORIGIN: z.string().min(1).optional(),
  UPLOAD_SCANNER_STORAGE_S3_ACCESS_KEY_ID: z
    .string()
    .min(16)
    .max(256)
    .regex(/^[A-Za-z0-9_-]+$/u)
    .optional(),
  UPLOAD_SCANNER_STORAGE_S3_SECRET_ACCESS_KEY: z.string().min(32).max(512).optional(),
  UPLOAD_SCANNER_STORAGE_S3_REGION: z
    .string()
    .min(1)
    .max(64)
    .regex(/^[a-z0-9-]+$/u)
    .optional(),
  UPLOAD_SCANNER_CONTROL_SECRET: scannerSecret('UPLOAD_SCANNER_CONTROL_SECRET').optional(),
  UPLOAD_SCANNER_ATTESTATION_SECRET: scannerSecret('UPLOAD_SCANNER_ATTESTATION_SECRET').optional(),
  UPLOAD_SCANNER_NETWORK_POLICY: z.literal('private-only').optional(),
  UPLOAD_SCANNER_SIGNATURE_MAX_AGE_HOURS: z.coerce.number().int().min(1).max(168).optional(),
  UPLOAD_SCANNER_MAX_CONCURRENT_JOBS: z.coerce.number().int().min(1).max(1).optional(),
  UPLOAD_SCANNER_JOB_DEADLINE_SECONDS: z.coerce.number().int().min(120).max(120).optional(),
  UPLOAD_SCANNER_CONTROL_TIMEOUT_MS: z.coerce.number().int().min(5_000).max(5_000).optional(),
  UPLOAD_SCANNER_WORKER_ID: z
    .string()
    .regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,119}$/u)
    .optional(),
  UPLOAD_SCANNER_IDLE_DELAY_MS: z.coerce.number().int().min(100).max(10_000).optional(),
  UPLOAD_SCANNER_ALERTS_ENABLED: booleanString.optional(),
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
  const localOrTest = env.APP_ENV === 'local' || env.APP_ENV === 'test';
  if (env.SALLAH_SUPABASE_PUBLIC_URL !== undefined) {
    validateMediaOrigin(env.SALLAH_SUPABASE_PUBLIC_URL, localOrTest);
  }
  if (
    (env.AI_PROVIDER === 'openai' ||
      env.TRANSLATION_PROVIDER === 'openai' ||
      env.TRANSCRIPTION_PROVIDER === 'openai') &&
    !env.OPENAI_API_KEY
  ) {
    throw new Error('OPENAI_API_KEY is required by every selected OpenAI provider');
  }
  if (!localOrTest && env.AI_PROVIDER === 'deterministic') {
    throw new Error(`Deterministic AI is test/local-only and forbidden in ${env.APP_ENV}`);
  }
  if (!localOrTest && env.TRANSLATION_PROVIDER === 'deterministic') {
    throw new Error(`Deterministic translation is test/local-only and forbidden in ${env.APP_ENV}`);
  }
  if (!localOrTest && env.UPLOAD_SCANNER_MODE !== 'external') {
    throw new Error(
      `Deterministic upload scanning is test/local-only; external scanning is required in ${env.APP_ENV}`,
    );
  }
  if (env.UPLOAD_SCANNER_MODE === 'external') {
    const required = [
      'UPLOAD_SCANNER_CONTROL_ORIGIN',
      'UPLOAD_SCANNER_STORAGE_ORIGIN',
      'UPLOAD_SCANNER_STORAGE_S3_ACCESS_KEY_ID',
      'UPLOAD_SCANNER_STORAGE_S3_SECRET_ACCESS_KEY',
      'UPLOAD_SCANNER_STORAGE_S3_REGION',
      'UPLOAD_SCANNER_CONTROL_SECRET',
      'UPLOAD_SCANNER_ATTESTATION_SECRET',
      'UPLOAD_SCANNER_NETWORK_POLICY',
      'UPLOAD_SCANNER_SIGNATURE_MAX_AGE_HOURS',
      'UPLOAD_SCANNER_MAX_CONCURRENT_JOBS',
      'UPLOAD_SCANNER_JOB_DEADLINE_SECONDS',
      'UPLOAD_SCANNER_CONTROL_TIMEOUT_MS',
      'UPLOAD_SCANNER_WORKER_ID',
      'UPLOAD_SCANNER_IDLE_DELAY_MS',
      'UPLOAD_SCANNER_ALERTS_ENABLED',
    ] as const;
    const missing = required.filter((name) => env[name] === undefined);
    if (missing.length > 0) {
      throw new Error(`Missing scanner variables: ${missing.join(', ')}`);
    }
    validateScannerOrigin(
      env.UPLOAD_SCANNER_CONTROL_ORIGIN!,
      'UPLOAD_SCANNER_CONTROL_ORIGIN',
      localOrTest,
    );
    validateScannerOrigin(
      env.UPLOAD_SCANNER_STORAGE_ORIGIN!,
      'UPLOAD_SCANNER_STORAGE_ORIGIN',
      localOrTest,
    );
    if (env.UPLOAD_SCANNER_CONTROL_SECRET === env.UPLOAD_SCANNER_ATTESTATION_SECRET) {
      throw new Error('Scanner control and attestation secrets must differ');
    }
    if (!localOrTest && env.UPLOAD_SCANNER_ALERTS_ENABLED !== true) {
      throw new Error('UPLOAD_SCANNER_ALERTS_ENABLED must be true outside local/test');
    }
  }
  if (env.PUSH_ENABLED) {
    const required = [
      'EXPO_ACCESS_TOKEN',
      'PUSH_TOKEN_ENCRYPTION_KEY',
      'NOTIFICATION_WORKER_SECRET',
    ] as const;
    const missing = required.filter((name) => env[name] === undefined);
    if (missing.length > 0) {
      throw new Error(`Missing push variables: ${missing.join(', ')}`);
    }
  }
  if (env.APP_ENV === 'production') {
    const missing: string[] = [];
    if (!env.SUPABASE_SECRET_KEY) missing.push('SUPABASE_SECRET_KEY');
    if (env.AI_PROVIDER === 'gemini' && !env.GEMINI_API_KEY) missing.push('GEMINI_API_KEY');
    if (env.PAYMENT_PROVIDER === 'fake' || env.PAYMENT_PROVIDER === 'sandbox') {
      throw new Error('Fake and sandbox payment providers are forbidden in production');
    }
    if (env.AI_PROVIDER === 'deterministic') {
      throw new Error(
        'Deterministic AI is test/local-only; use a real provider or disable AI in production',
      );
    }
    if (missing.length > 0) throw new Error(`Missing production variables: ${missing.join(', ')}`);
  }
  return env;
}
