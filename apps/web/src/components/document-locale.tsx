'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { direction, supportedLocales, translate, type SupportedLocale } from '@sallah/i18n';

export function DocumentLocale() {
  const segment = usePathname().split('/')[1];
  const locale: SupportedLocale =
    supportedLocales.find((candidate) => candidate === segment) ?? 'ar';
  useEffect(() => {
    document.documentElement.lang = locale;
    document.documentElement.dir = direction(locale);
  }, [locale]);

  return (
    <a className="skip-link" href="#main" lang={locale} dir={direction(locale)}>
      {translate(locale, 'publicSkipToContent')}
    </a>
  );
}
