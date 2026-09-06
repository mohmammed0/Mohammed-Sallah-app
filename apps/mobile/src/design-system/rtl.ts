import type { AppIconName } from './icon';

export type CustomerLocale = 'ar' | 'en' | 'ur' | 'hi';

export function isRtlLocale(locale: CustomerLocale): boolean {
  return locale === 'ar' || locale === 'ur';
}

export function logicalFlexDirection(locale: CustomerLocale): 'row' | 'row-reverse' {
  return isRtlLocale(locale) ? 'row-reverse' : 'row';
}

export function logicalTextAlignment(locale: CustomerLocale): 'left' | 'right' {
  return isRtlLocale(locale) ? 'right' : 'left';
}

export function logicalWritingDirection(locale: CustomerLocale): 'ltr' | 'rtl' {
  return isRtlLocale(locale) ? 'rtl' : 'ltr';
}

// These helpers already choose physical left/right or reverse the row. Keep
// their Yoga coordinates LTR so inherited RTL cannot apply a second reversal.
// Android text alignment is also resolved against the Yoga paragraph direction.
export function logicalRowStyle(locale: CustomerLocale) {
  return { direction: 'ltr', flexDirection: logicalFlexDirection(locale) } as const;
}

export function logicalTextStyle(locale: CustomerLocale) {
  return {
    direction: 'ltr',
    textAlign: logicalTextAlignment(locale),
    writingDirection: logicalWritingDirection(locale),
  } as const;
}

export function logicalChevron(locale: CustomerLocale, action: 'back' | 'forward'): AppIconName {
  const forward = action === 'forward';
  if (isRtlLocale(locale)) return forward ? 'chevron-back' : 'chevron-forward';
  return forward ? 'chevron-forward' : 'chevron-back';
}
