import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        // Staff tools, a visitor's own account, and every auth screen
        // (signin/register/verification/password recovery) -- there is no
        // search value in indexing a login form.
        disallow: [
          '/en/staff', '/am/staff',
          '/en/bookings', '/am/bookings',
          '/en/settings', '/am/settings',
          '/en/signin', '/am/signin',
          '/en/register', '/am/register',
          '/en/verify', '/am/verify',
          '/en/verify-email', '/am/verify-email',
          '/en/forgot-password', '/am/forgot-password',
          '/en/reset-password', '/am/reset-password',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
  };
}
