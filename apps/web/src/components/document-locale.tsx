'use client';

import { useEffect } from 'react';
import { usePathname } from 'next/navigation';
import { direction, translate } from '@sallah/i18n';
import { documentLocaleFromPath } from '@/lib/document-language';

export function DocumentLocale() {
  const locale = documentLocaleFromPath(usePathname());
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
