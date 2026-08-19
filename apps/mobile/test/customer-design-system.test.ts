import { describe, expect, it } from 'vitest';
import {
  customerColorSchemes,
  customerMotionDuration,
  customerTokens,
} from '../src/design-system/tokens';
import {
  isRtlLocale,
  logicalChevron,
  logicalFlexDirection,
  logicalTextAlignment,
} from '../src/design-system/rtl';

describe('customer design-system foundations', () => {
  it('keeps semantic light and dark color contracts aligned', () => {
    expect(Object.keys(customerColorSchemes.light).sort()).toEqual(
      Object.keys(customerColorSchemes.dark).sort(),
    );
    expect(customerTokens.touchTarget).toBeGreaterThanOrEqual(48);
    expect(customerTokens.iconSize.md).toBeGreaterThan(0);
  });

  it('removes nonessential motion when reduced motion is enabled', () => {
    expect(customerMotionDuration(true, 'slow')).toBe(0);
    expect(customerMotionDuration(false, 'standard')).toBe(
      customerTokens.motion.standard,
    );
  });

  it('uses logical RTL and LTR directions without changing source order', () => {
    expect(isRtlLocale('ar')).toBe(true);
    expect(isRtlLocale('ur')).toBe(true);
    expect(isRtlLocale('en')).toBe(false);
    expect(isRtlLocale('hi')).toBe(false);
    expect(logicalFlexDirection('ar')).toBe('row-reverse');
    expect(logicalTextAlignment('ar')).toBe('right');
    expect(logicalChevron('ar', 'forward')).toBe('chevron-back');
    expect(logicalChevron('en', 'forward')).toBe('chevron-forward');
  });
});
