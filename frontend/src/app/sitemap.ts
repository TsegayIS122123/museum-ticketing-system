import type { MetadataRoute } from 'next';
import { LOCALES, PUBLIC_PATHS, SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  return PUBLIC_PATHS.flatMap((path) =>
    LOCALES.map((lang) => ({
      url: `${SITE_URL}/${lang}${path}`,
      changeFrequency: path === '' ? ('weekly' as const) : ('monthly' as const),
      priority: path === '' ? 1 : 0.7,
      alternates: {
        languages: Object.fromEntries(LOCALES.map((l) => [l, `${SITE_URL}/${l}${path}`])),
      },
    }))
  );
}
