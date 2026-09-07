import { describe, expect, it } from 'vitest';
import { Constants } from '@sallah/database/types';
import { formatStatusLabel, supportedLocales } from '@sallah/i18n';

describe('job and payment status labels', () => {
  it.each(supportedLocales)('labels every database job and financial state in %s', (locale) => {
    const unknown = formatStatusLabel('__unknown_status__', locale);
    const states = [
      ...Constants.public.Enums.job_status,
      ...Constants.public.Enums.financial_status,
    ];
    for (const state of states) {
      const label = formatStatusLabel(state, locale);
      expect(label, `${locale}.${state}`).not.toBe(unknown);
      expect(label, `${locale}.${state}`).not.toBe(state);
      if (locale !== 'en') {
        expect(label, `${locale}.${state}`).toMatch(
          locale === 'hi' ? /[\u0900-\u097f]/u : /[\u0600-\u06ff]/u,
        );
      }
    }
  });
});
