import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: { default: 'صلّح | خدمات منزلية بثقة', template: '%s | صلّح' },
  description:
    'سوق خدمات سعودي عربي أولًا يربط العملاء بمقدمي خدمات موثوقين عبر عروض خاصة ومسار عمل واضح.',
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000'),
  openGraph: { type: 'website', locale: 'ar_SA', siteName: 'SALLAH' },
};
export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="ar" dir="rtl">
      <body>
        <a className="skip-link" href="#main">
          انتقل إلى المحتوى
        </a>
        {children}
      </body>
    </html>
  );
}
