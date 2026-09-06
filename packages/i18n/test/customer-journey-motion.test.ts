import { describe, expect, it } from 'vitest';
import { resources, supportedLocales, translate, type TranslationKey } from '../src';

const journeyKeys = [
  'requestSendingTitle',
  'requestSendingBody',
  'requestWaitingTitle',
  'requestWaitingBody',
  'waitingRefreshHint',
  'refreshOffers',
  'offersReadyTitle',
  'offersReadyBody',
  'offerSelectingTitle',
  'offerSelectingBody',
  'serviceTrackingTitle',
  'serviceBookedBody',
  'serviceEnRouteBody',
  'serviceArrivedBody',
  'serviceWorkingBody',
  'serviceReviewTitle',
  'serviceReviewBody',
  'serviceCompletedTitle',
  'serviceCompletedBody',
  'servicePausedBody',
  'viewRequestOffers',
  'viewAllRequests',
  'nextStepsTitle',
  'nextStepOffers',
  'nextStepChoose',
  'nextStepReceive',
  'serviceProgressLabel',
  'refreshStatus',
  'waitingStatusUnavailable',
  'requestClosedTitle',
  'requestClosedBody',
  'requestStatusUnknownTitle',
  'requestStatusUnknownBody',
] as const satisfies readonly TranslationKey[];

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*(\w+)\s*\}\}/gu)].map((match) => match[1] ?? '').sort();
}

describe('customer ordering, waiting and completion copy', () => {
  it.each(supportedLocales)('provides native %s copy for every journey state', (locale) => {
    const nativeScript = locale === 'hi' ? /[\u0900-\u097f]/u : /[\u0600-\u06ff]/u;
    for (const key of journeyKeys) {
      const value = resources[locale].translation[key];
      expect(value, `${locale}.${key}`).toBeTruthy();
      expect(value, `${locale}.${key}`).not.toBe(key);
      expect(placeholders(value), `${locale}.${key}`).toEqual(
        key === 'offersReadyBody' ? ['count'] : [],
      );
      if (locale !== 'en') {
        expect(value, `${locale}.${key}`).not.toBe(resources.en.translation[key]);
        expect(value, `${locale}.${key}`).toMatch(nativeScript);
      }
    }
  });

  it.each(supportedLocales)(
    'renders actual offer counts in %s without unresolved tokens',
    (locale) => {
      for (const count of [0, 1, 4]) {
        const value = translate(locale, 'offersReadyBody', { count });
        expect(value).toContain(String(count));
        expect(value).not.toMatch(/\{\{|\}\}/u);
      }
    },
  );
});
