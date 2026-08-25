import { validateServerEnvironment } from '../packages/config/src/env.ts';

export const productionRequiredKeys = [
  'APP_ENV',
  'SUPABASE_URL',
  'SUPABASE_PUBLISHABLE_KEY',
  'SUPABASE_SECRET_KEY',
  'SALLAH_PUBLIC_URL',
  'SALLAH_SUPPORT_EMAIL',
  'SALLAH_PRIVACY_URL',
  'SALLAH_TERMS_URL',
  'SALLAH_LEGAL_ENTITY',
  'EAS_PROJECT_ID',
  'SALLAH_IOS_BUNDLE_ID',
  'SALLAH_ANDROID_PACKAGE',
  'SALLAH_ANDROID_GOOGLE_MAPS_API_KEY',
  'PUSH_ENABLED',
  'EXPO_ACCESS_TOKEN',
  'PUSH_TOKEN_ENCRYPTION_KEY',
  'NOTIFICATION_WORKER_SECRET',
  'UPLOAD_SCANNER_MODE',
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
];

const placeholderPattern = /example\.|\.invalid|REQUIRES_HUMAN_INPUT|changeme|placeholder/i;

export function validateProductionConfiguration(environment) {
  const missing = productionRequiredKeys.filter((key) => !environment[key]);
  if (environment.APP_ENV && environment.APP_ENV !== 'production') {
    missing.push('APP_ENV(production)');
  }
  for (const key of productionRequiredKeys) {
    const value = environment[key];
    if (value && placeholderPattern.test(value)) missing.push(`${key}(placeholder)`);
  }
  const ai = environment.AI_PROVIDER;
  if (ai !== 'openai') missing.push('AI_PROVIDER(openai)');
  if (ai === 'openai' && !environment.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
  if ((environment.TRANSLATION_PROVIDER ?? 'disabled') !== 'disabled') {
    missing.push('TRANSLATION_PROVIDER(unsupported until privacy approval)');
  }
  if (environment.PUSH_ENABLED !== 'true') missing.push('PUSH_ENABLED(true)');
  if (['fake', 'sandbox'].includes(environment.PAYMENT_PROVIDER ?? '')) {
    return { ok: false, message: 'Unsafe production payment provider' };
  }
  if (missing.length) {
    return {
      ok: false,
      message: `Production configuration blocked. Missing: ${[...new Set(missing)].join(', ')}`,
    };
  }

  try {
    validateServerEnvironment(environment);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid production environment';
    return { ok: false, message: `Production configuration blocked. ${message}` };
  }

  return {
    ok: true,
    message: 'Production configuration is complete, non-placeholder, and uses no fake provider.',
  };
}
