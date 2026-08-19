const required = [
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
];
const missing = required.filter((key) => !process.env[key]);
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
console.log('Production configuration is complete, non-placeholder, and uses no fake provider.');
