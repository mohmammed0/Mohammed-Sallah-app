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

export function logicalChevron(
  locale: CustomerLocale,
  action: 'back' | 'forward',
): AppIconName {
  const forward = action === 'forward';
  if (isRtlLocale(locale)) return forward ? 'chevron-back' : 'chevron-forward';
  return forward ? 'chevron-forward' : 'chevron-back';
}
