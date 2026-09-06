import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { resources, type TranslationKey } from '../src';

// Inspect the bounded launch surfaces, including keys in conditional expressions,
// action arrays and reusable components. New visible keys join this check automatically.
const journeySources = [
  'apps/mobile/app/index.tsx',
  'apps/mobile/src/features/customer/customer-home.tsx',
  'apps/mobile/app/(customer)/_layout.tsx',
  'apps/mobile/app/(provider)/provider-home.tsx',
  'apps/mobile/app/(provider)/_layout.tsx',
  'apps/mobile/app/provider/feed.tsx',
  'apps/mobile/app/provider/offer.tsx',
  'apps/mobile/app/offers.tsx',
  'apps/mobile/src/design-system/primitives.tsx',
  'apps/mobile/src/design-system/customer-components.tsx',
] as const;

function collectJourneyKeys(): TranslationKey[] {
  const keys = new Set<TranslationKey>();
  for (const path of journeySources) {
    const sourceUrl = new URL(`../../../${path}`, import.meta.url);
    const sourcePath = decodeURIComponent(sourceUrl.pathname).replace(/^\/(?=[a-z]:\/)/iu, '');
    const content = ts.sys.readFile(sourcePath);
    if (content === undefined) throw new Error(`Launch journey source unavailable: ${path}`);
    const source = ts.createSourceFile(
      path,
      content,
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    function visit(node: ts.Node) {
      if (ts.isStringLiteralLike(node) && Object.hasOwn(resources.ar.translation, node.text)) {
        keys.add(node.text as TranslationKey);
      }
      ts.forEachChild(node, visit);
    }
    visit(source);
  }
  return [...keys].sort();
}

function placeholders(value: string): string[] {
  return [...value.matchAll(/\{\{\s*(\w+)\s*\}\}/gu)].map((match) => match[1] ?? '').sort();
}

describe('launch journey translation completeness', () => {
  const keys = collectJourneyKeys();

  it('includes contextual actions, feedback and shared navigation', () => {
    expect(keys).toEqual(
      expect.arrayContaining([
        'providerPrivacyNotice',
        'providerOnboarding',
        'providerOfferFailed',
        'hideRequestDetails',
        'showRequestDetails',
        'offerWithdrawn',
        'offerExpired',
        'homeCatalogEmptyTitle',
        'homeSearchEmptyTitle',
        'requests',
        'jobDetailsTitle',
      ]),
    );
  });

  it.each(['ur', 'hi'] as const)(
    'uses native %s copy and preserves every interpolation parameter',
    (locale) => {
      for (const key of keys) {
        const translated = resources[locale].translation[key];
        const english = resources.en.translation[key];
        expect(translated, `${locale}.${key}`).toBeTruthy();
        expect(placeholders(translated), `${locale}.${key}`).toEqual(placeholders(english));
        // SALLAH is a brand wordmark, not untranslated interface copy.
        if (key === 'appName') continue;
        expect(translated, `${locale}.${key}`).not.toBe(english);
        expect(translated, `${locale}.${key}`).toMatch(
          locale === 'ur' ? /[\u0600-\u06ff]/u : /[\u0900-\u097f]/u,
        );
      }
    },
  );
});
