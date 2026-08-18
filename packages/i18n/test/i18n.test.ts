import { describe, expect, it } from 'vitest';
import { direction, formatStatusLabel, resources, supportedLocales, translate } from '../src';

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
  it('interpolates named values without evaluating content', () => {
    expect(translate('en', 'versionSummary', { version: 7 })).toBe('Version 7');
    expect(translate('ar', 'requestNumber', { id: '<unsafe>' })).toContain('<unsafe>');
  });
  it('localizes workflow statuses instead of exposing database tokens', () => {
    for (const locale of supportedLocales) {
      expect(formatStatusLabel('in_progress', locale)).not.toBe('in_progress');
      expect(formatStatusLabel('blocked_retention', locale)).not.toBe('blocked_retention');
      expect(formatStatusLabel('unrecognized_state', locale).length).toBeGreaterThan(0);
    }
  });
});
