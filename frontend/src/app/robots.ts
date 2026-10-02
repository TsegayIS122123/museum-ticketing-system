import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Staff tools and anything behind a visitor's own account.
        disallow: ['/en/staff', '/am/staff', '/en/bookings', '/am/bookings', '/en/settings', '/am/settings', '/en/verify', '/am/verify', '/en/reset-password', '/am/reset-password'],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
