import type { MetadataRoute } from 'next';
import { pages } from '@/content';
export default function sitemap(): MetadataRoute.Sitemap {
  const base = process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000';
  return ['ar', 'en'].flatMap((locale) => [
    { url: `${base}/${locale}`, changeFrequency: 'weekly' as const, priority: 1 },
    ...Object.keys(pages).map((slug) => ({
      url: `${base}/${locale}/${slug}`,
      changeFrequency: 'monthly' as const,
      priority: 0.7,
    })),
    {
      url: `${base}/${locale}/account-deletion`,
      changeFrequency: 'yearly' as const,
      priority: 0.4,
    },
  ]);
}
