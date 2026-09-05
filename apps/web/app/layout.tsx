import type { Metadata } from 'next';
import { headers } from 'next/headers';
import { direction } from '@sallah/i18n';
import { documentLocaleHeader, parseDocumentLocale } from '@/lib/document-language';
import { DocumentLocale } from '@/components/document-locale';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'صلّح | خدمات منزلية بثقة', template: '%s | صلّح' },
  description:
    'سوق خدمات سعودي عربي أولًا يربط العملاء بمقدمي خدمات موثوقين عبر عروض خاصة ومسار عمل واضح.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  openGraph: { type: 'website', locale: 'ar_SA', siteName: 'SALLAH' },
};
export default async function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  const locale = parseDocumentLocale((await headers()).get(documentLocaleHeader));
  return (
    <html lang={locale} dir={direction(locale)}>
      <body>
        <DocumentLocale />
        {children}
      </body>
    </html>
  );
}
