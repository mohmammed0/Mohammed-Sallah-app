import { createClient } from '@supabase/supabase-js';
import { readPublicLegalConnection } from '@sallah/config/web';
import { legalConsentContextSchema, type LegalDocument } from '@sallah/domain';
import type { SupportedLocale } from '@sallah/i18n';

export type PublicLegalRequest = (
  locale: SupportedLocale,
  signal: AbortSignal,
) => PromiseLike<{ readonly data: unknown; readonly error: unknown }>;

const requestCurrentDocuments: PublicLegalRequest = (locale, signal) => {
  const configuration = readPublicLegalConnection();
  if (!configuration) throw new Error('PUBLIC_LEGAL_CONFIGURATION_UNAVAILABLE');
  // A separate anonymous client never reads a visitor's cookies or session.
  const client = createClient(configuration.url, configuration.key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: {
      fetch: (input, init) => fetch(input, { ...init, cache: 'no-store' }),
    },
  });
  return client.rpc('get_legal_consent_context', { p_locale: locale }).abortSignal(signal);
};

export async function loadPublicLegalDocument(
  locale: SupportedLocale,
  documentType: LegalDocument['documentType'],
  request: PublicLegalRequest = requestCurrentDocuments,
): Promise<LegalDocument | null> {
  try {
    const response = await request(locale, AbortSignal.timeout(5_000));
    if (response.error) return null;
    const parsed = legalConsentContextSchema.safeParse(response.data);
    if (!parsed.success || parsed.data.missingRequiredTypes.includes(documentType)) return null;
    return (
      parsed.data.documents.find(
        (document) => document.documentType === documentType && document.locale === locale,
      ) ?? null
    );
  } catch {
    // Public responses never expose backend errors, URLs or credentials.
    return null;
  }
}
