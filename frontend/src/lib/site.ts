/** Canonical origin for absolute URLs (sitemap, Open Graph, hreflang). Set
 *  NEXT_PUBLIC_SITE_URL in every deployed environment. */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? 'http://localhost:3000').replace(/\/$/, '');
export const LOCALES = ['en', 'am'] as const;
export type Locale = (typeof LOCALES)[number];

/** Public, indexable visitor pages. Account/booking/staff pages are
 *  private and excluded from the sitemap and blocked in robots.txt. */
export const PUBLIC_PATHS = ['', '/book', '/group-visits/new'] as const;
