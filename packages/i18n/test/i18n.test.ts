import { describe, expect, it } from 'vitest';
import { direction, resources, supportedLocales, translate } from '../src';

describe('localization', () => {
  it('keeps key parity', () => {
    const base = Object.keys(resources.ar.translation).sort();
    for (const locale of supportedLocales)
      expect(Object.keys(resources[locale].translation).sort()).toEqual(base);
  });
  it('uses RTL for Arabic and Urdu', () => {
    expect(direction('ar')).toBe('rtl');
    expect(direction('ur')).toBe('rtl');
    expect(direction('hi')).toBe('ltr');
  });
  it('never returns an empty key', () => {
    for (const locale of supportedLocales)
      expect(translate(locale, 'publishRequest').length).toBeGreaterThan(0);
  });
});
