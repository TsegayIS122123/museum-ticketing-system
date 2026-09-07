'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { LanguageToggle } from '@/components/ui/LanguageToggle';

export function SiteHeader() {
  const { t, locale } = useTranslation();
  const { user, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Path shape is always `/{locale}/...`, so the segment right after the
  // locale tells us whether we're in the staff area -- the visitor-facing
  // links (Book a visit / Manage bookings / Visitor verification) don't
  // belong on any /staff/* page, which has its own StaffSidebar nav.
  const isStaffArea = pathname?.split('/').filter(Boolean)[1] === 'staff';
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  // Primary nav + language toggle (and, when signed in, the profile menu)
  // don't fit next to the logo below `md` -- everything collapses into
  // this single toggle-able panel instead of wrapping or overflowing.
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Lock background scroll while the mobile overlay is open, same
  // approach as components/ui/Modal.tsx -- this now opens as a modal-like
  // overlay over the page instead of pushing page content down.
  useEffect(() => {
    document.body.style.overflow = isMobileMenuOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileMenuOpen]);

  const handleSignOut = () => {
    logout();
    setIsMobileMenuOpen(false);
    router.push(`/${locale}`);
  };

  const profilePath = `/${locale}/settings/account`;

  const navLinks = isStaffArea
    ? []
    : [
        { href: `/${locale}/book`, label: t('footer_book_a_visit') || 'Book a visit' },
        { href: `/${locale}/bookings`, label: t('footer_manage_bookings') || 'Manage bookings' },
        { href: `/${locale}/verify`, label: t('footer_visitor_verification') || 'Visitor verification' },
      ];

  const displayName = user ? (user.full_name || user.email) : '';

  return (
    <header className="relative z-50 border-b border-brand-primary/15 bg-white">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:gap-4 sm:px-6 lg:px-8">
        <Link href={`/${locale}`} className="flex min-w-0 shrink items-center gap-2 sm:gap-3">
          <Image src="/aau-logo.png" alt={t('aau_logo_alt') || 'Addis Ababa University'} width={40} height={40} priority className="shrink-0" />
          <span className="truncate font-serif font-semibold text-base text-brand-primary sm:text-lg lg:text-xl">{t('museum_name')}</span>
        </Link>

        <div className="flex shrink-0 items-center gap-2 sm:gap-4">
          {navLinks.length > 0 && (
            <nav aria-label={t('primary_navigation') || 'Primary'} className="hidden items-center gap-4 text-sm font-semibold text-brand-primary md:flex">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href} className="hover:underline">
                  {link.label}
                </Link>
              ))}
            </nav>
          )}

          <div className="hidden sm:block">
            <LanguageToggle />
          </div>

          {isAuthenticated && user && (
            <div className="relative hidden md:block">
              <button
                type="button"
                onClick={() => setIsProfileOpen((open) => !open)}
                aria-expanded={isProfileOpen}
                aria-haspopup="menu"
                className="flex max-w-[10rem] items-center gap-2 text-sm font-semibold text-brand-primary"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-primary text-xs text-white">
                  {displayName.charAt(0).toUpperCase()}
                </span>
                <span className="truncate">{displayName}</span>
              </button>
              {isProfileOpen && (
                <div role="menu" className="absolute right-0 z-20 mt-2 min-w-44 rounded-lg border border-stone-200 bg-white p-1 shadow-lg">
                  <Link href={profilePath} role="menuitem" onClick={() => setIsProfileOpen(false)} className="block rounded px-3 py-2 text-sm text-stone-700 hover:bg-stone-100">
                    {t('profile') || 'Profile'}
                  </Link>
                  <button type="button" role="menuitem" onClick={handleSignOut} className="block w-full rounded px-3 py-2 text-left text-sm text-red-600 hover:bg-red-50">
                    {t('logout') || 'Logout'}
                  </button>
                </div>
              )}
            </div>
          )}

          <button
            type="button"
            onClick={() => setIsMobileMenuOpen((open) => !open)}
            aria-expanded={isMobileMenuOpen}
            aria-controls="mobile-primary-nav"
            aria-label={isMobileMenuOpen ? t('close_menu') || 'Close menu' : t('open_menu') || 'Open menu'}
            className="flex h-10 w-10 items-center justify-center rounded-lg text-brand-primary hover:bg-brand-primary/10 md:hidden"
          >
            {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </button>
        </div>
      </div>

      {isMobileMenuOpen && (
        // Overlay panel -- sits above the page (not inline in the header
        // flow), so opening it no longer pushes the rest of the page
        // down. The backdrop blurs/dims everything below the header,
        // same modal pattern as VisitorSidebar's old mobile drawer.
        <div className="fixed inset-x-0 top-16 bottom-0 z-40 md:hidden">
          <div
            className="absolute inset-0 bg-black/40 backdrop-blur-sm"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div
            id="mobile-primary-nav"
            className="relative max-h-full overflow-y-auto border-t border-brand-primary/15 bg-white px-4 py-3 shadow-xl"
          >
            {navLinks.length > 0 && (
              <nav aria-label={t('primary_navigation') || 'Primary'} className="flex flex-col gap-1 text-sm font-semibold text-brand-primary">
                {navLinks.map((link) => (
                  <Link
                    key={link.href}
                    href={link.href}
                    onClick={() => setIsMobileMenuOpen(false)}
                    className="rounded-lg px-2 py-2 hover:bg-brand-primary/5"
                  >
                    {link.label}
                  </Link>
                ))}
              </nav>
            )}

            {isAuthenticated && user && (
              // Only the profile and logout actions belong here -- unlike
              // the desktop trigger button, this collapsed panel doesn't
              // surface the visitor's name.
              <div className="mt-3 border-t border-brand-primary/10 pt-3">
                <Link
                  href={profilePath}
                  onClick={() => setIsMobileMenuOpen(false)}
                  className="block rounded-lg px-2 py-2 text-sm font-semibold text-brand-primary hover:bg-brand-primary/5"
                >
                  {t('profile') || 'Profile'}
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="block w-full rounded-lg px-2 py-2 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
                >
                  {t('logout') || 'Logout'}
                </button>
              </div>
            )}

            <div className="mt-3 border-t border-brand-primary/10 pt-3 sm:hidden">
              <LanguageToggle />
            </div>
          </div>
        </div>
      )}
    </header>
  );
}
