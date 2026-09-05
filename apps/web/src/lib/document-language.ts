import { supportedLocales, type SupportedLocale } from '@sallah/i18n';
import { z } from 'zod';

export const documentLocaleHeader = 'x-sallah-document-locale';
const localeSchema = z.enum(supportedLocales);

export function parseDocumentLocale(value: unknown): SupportedLocale {
  const parsed = localeSchema.safeParse(value);
  return parsed.success ? parsed.data : 'ar';
}

export function documentLocaleFromPath(pathname: string): SupportedLocale {
  try {
    return parseDocumentLocale(decodeURIComponent(pathname.split('/')[1] ?? ''));
  } catch {
    return 'ar';
  }
}
