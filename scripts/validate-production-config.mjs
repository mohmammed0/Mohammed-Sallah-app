import { validateServerEnvironment } from '../packages/config/src/env.ts';

const required = [
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
const missing = required.filter((key) => !process.env[key]);
if (process.env.APP_ENV && process.env.APP_ENV !== 'production') {
  missing.push('APP_ENV(production)');
}
const placeholderPattern = /example\.|\.invalid|REQUIRES_HUMAN_INPUT|changeme|placeholder/i;
for (const key of required) {
  const value = process.env[key];
  if (value && placeholderPattern.test(value)) missing.push(`${key}(placeholder)`);
}
const ai = process.env.AI_PROVIDER;
if (ai !== 'openai') missing.push('AI_PROVIDER(openai)');
if (ai === 'openai' && !process.env.OPENAI_API_KEY) missing.push('OPENAI_API_KEY');
if ((process.env.TRANSLATION_PROVIDER ?? 'disabled') !== 'disabled') {
  missing.push('TRANSLATION_PROVIDER(unsupported until privacy approval)');
}
if (['fake', 'sandbox'].includes(process.env.PAYMENT_PROVIDER ?? '')) {
  console.error('Unsafe production payment provider');
  process.exit(1);
}
if (missing.length) {
  console.error(`Production configuration blocked. Missing: ${[...new Set(missing)].join(', ')}`);
  process.exit(1);
}

try {
  validateServerEnvironment({ ...process.env });
} catch (error) {
  const message = error instanceof Error ? error.message : 'Invalid production environment';
  console.error(`Production configuration blocked. ${message}`);
  process.exit(1);
}

console.log('Production configuration is complete, non-placeholder, and uses no fake provider.');
