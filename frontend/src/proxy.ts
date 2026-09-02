import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const locales = ['en', 'am'];
const defaultLocale = 'en';

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  
  // Skip static files and API routes
  if (
    pathname.startsWith('/_next') || 
    pathname.startsWith('/api') || 
    pathname.match(/\.(jpg|jpeg|png|svg|css|js|ico|webp|woff|woff2)$/)
  ) {
    return NextResponse.next();
  }

  // Check if path already has a valid locale
  const segments = pathname.split('/').filter(Boolean);
  const pathHasLocale = locales.includes(segments[0]);

  if (pathHasLocale) {
    // Set cookie for future requests
    const locale = segments[0];
    const response = NextResponse.next();
    response.cookies.set('NEXT_LOCALE', locale, { 
      maxAge: 60 * 60 * 24 * 365, 
      path: '/' 
    });
    return response;
  }

  // Get preferred locale from cookie or header
  const locale = request.cookies.get('NEXT_LOCALE')?.value || 
                  defaultLocale;
  
  // Build new URL with locale
  const cleanPath = pathname === '/' ? '' : pathname;
  const newUrl = new URL(`/${locale}${cleanPath}${request.nextUrl.search}`, request.url);
  const response = NextResponse.redirect(newUrl);
  response.cookies.set('NEXT_LOCALE', locale, { 
    maxAge: 60 * 60 * 24 * 365, 
    path: '/' 
  });
  return response;
}

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)'],
};
