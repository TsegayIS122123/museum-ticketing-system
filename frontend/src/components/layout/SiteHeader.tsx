'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { isStaff } from '@/lib/auth/roles';
import { LanguageToggle } from '@/components/ui/LanguageToggle';
import { cn } from '@/lib/utils/cn';

export function SiteHeader() {
  const { t, locale } = useTranslation();
  const { user, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  // Path shape is always `/{locale}/...`, so the segment right after the
  // locale tells us whether we're in the staff area -- the visitor-facing
  // links (Book a visit / Manage bookings / Visitor verification) don't
  // belong on any /staff/* page, which has its own StaffSidebar nav.
  //
  // `/settings/account` is the one exception: it's a role-agnostic route
  // (app/[lang]/settings/account/page.tsx) outside `/staff/*` on purpose
  // -- StaffLayout redirects non-staff away, and this route must stay
  // reachable for visitors too -- but it renders the *staff* chrome
  // (StaffSidebar) for staff users. Without this check, `isStaffArea` was
  // false there even for staff, so this header showed its visitor nav
  // links, its own mobile hamburger, and the name/logout dropdown right
  // alongside StaffSidebar's -- duplicated chrome, laid out for a
  // visitor page, is what broke the mobile toggle bar's layout there.
  const isStaffArea =
    pathname?.split('/').filter(Boolean)[1] === 'staff' ||
    (pathname?.includes('/settings/account') && !!user && isStaff(user.role));
  // A staff account browsing a *non*-staff page (e.g. the public
  // homepage, still logged in from an earlier /staff/* session) isn't
  // covered by `isStaffArea` above -- that only looks at the URL, not
  // who's logged in. "Book a visit" / "Manage bookings" / "Visitor
  // verification" are Visitor-only actions (booking flow, OTP login) a
  // staff account has no use for and isn't the intended audience of, so
  // they're hidden whenever the signed-in user is staff, regardless of
  // which page they're on or which device they're using -- both the
  // desktop nav and the mobile panel read from the same `navLinks` below.
  const isStaffUser = !!user && isStaff(user.role);
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  // Primary nav + language toggle (and, when signed in, the profile menu)
  // don't reliably fit next to the logo below `lg` -- everything
  // collapses into this single toggle-able panel instead of wrapping,
  // overflowing, or squeezing the museum name into a truncated stub.
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

  // "Visitor verification" is how a signed-out visitor logs in (email +
  // phone -> OTP) -- it has nothing left to offer someone who's already
  // authenticated, and showing "Verify" to an already-verified visitor
  // reads as a broken nav item ("verify" *what*, exactly?). So it only
  // ever appears here for a signed-out visitor; once logged in, this
  // link simply drops out of both the desktop nav and the mobile panel.
  const navLinks = isStaffArea || isStaffUser
    ? []
    : [
        { href: `/${locale}/book`, label: t('footer_book_a_visit') || 'Book a visit' },
        { href: `/${locale}/bookings`, label: t('footer_manage_bookings') || 'Manage bookings' },
        ...(isAuthenticated
          ? []
          : [{ href: `/${locale}/verify`, label: t('footer_visitor_verification') || 'Visitor verification' }]),
      ];

  const displayName = user ? (user.full_name || user.email) : '';

  // Normalize a nav href for comparison against the current pathname so
  // the active link still matches once locale/trailing slashes are
  // accounted for.
  const isActiveLink = (href: string) =>
    pathname === href || pathname?.startsWith(`${href}/`);

  return (
    <header className="relative z-50 border-b border-brand-primary/15 bg-white">
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6 lg:px-8">
        <Link href={`/${locale}`} className="flex min-w-0 items-center gap-2 sm:gap-3">
          <Image src="/aau-logo.png" alt={t('aau_logo_alt') || 'Addis Ababa University'} width={40} height={40} priority className="shrink-0" />
          <span className="truncate font-serif font-semibold text-base text-brand-primary sm:text-lg lg:text-xl">{t('museum_name')}</span>
        </Link>

        {/* The expanded row (nav links + language toggle + profile menu)
            only fits comfortably once there's real room for it -- below
            that it collapses into the hamburger panel instead of
            squeezing itself (and the brand name on the left) into too
            little space. That's the `lg` breakpoint here, not `md`:
            at md (768px) this row still crowded out the museum name,
            forcing it to truncate on common tablet-width windows.

            The row above switched from `min-h-16` to a fixed `h-16` for
            exactly the reason each item below is now `h-full` too:
            centering flex children with `items-center` only centers
            each item's own (possibly differently-sized, depending on
            its own font-size/padding) box within the *tallest sibling*,
            not against a shared, guaranteed reference frame -- which is
            what let the nav links visually sit noticeably higher than
            the language toggle/brand name despite all three nominally
            being "centered". Pinning every item to the same explicit
            height and centering *within* that removes the ambiguity. */}
        <div className="flex h-full shrink-0 items-center gap-2 lg:gap-6">
          {navLinks.length > 0 && (
            <nav aria-label={t('primary_navigation') || 'Primary'} className="hidden h-full items-center gap-5 text-sm font-semibold leading-none text-brand-primary lg:flex ">
              {navLinks.map((link) => {
                const active = isActiveLink(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'rounded-md px-1 py-1 leading-none transition-colors hover:text-brand-primary',
                      active
                        ? 'text-brand-primary underline decoration-2 underline-offset-8'
                        : 'text-brand-primary/70 hover:underline'
                    )}
                  >
                    {link.label}
                  </Link>
                );
              })}
            </nav>
          )}

          <div className="hidden h-full sm:flex sm:items-center">
            <LanguageToggle />
          </div>

          {/* Staff pages already show the account name, profile link, and
              logout action in StaffSidebar's left-hand nav -- repeating
              them here is redundant, so this global header drops the
              profile trigger entirely on /staff/* routes. */}
          {isAuthenticated && user && !isStaffArea && (
            <div className="relative hidden h-full items-center lg:flex">
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

          {/* This toggle only ever opens navLinks/profile/language-toggle
              -- all already empty or hidden on /staff/* routes (navLinks
              is `[]` for staff, profile is hidden above), and
              StaffSidebar has its own mobile nav toggle already. So the
              button (and the panel below) don't render at all here on
              staff pages instead of opening an empty/near-empty panel. */}
          {!isStaffArea && (
            <button
              type="button"
              onClick={() => setIsMobileMenuOpen((open) => !open)}
              aria-expanded={isMobileMenuOpen}
              aria-controls="mobile-primary-nav"
              aria-label={isMobileMenuOpen ? t('close_menu') || 'Close menu' : t('open_menu') || 'Open menu'}
              className="flex h-10 w-10 items-center justify-center rounded-lg text-brand-primary hover:bg-brand-primary/10 lg:hidden"
            >
              {isMobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          )}
        </div>
      </div>

      {isMobileMenuOpen && !isStaffArea && (
        // Overlay panel -- sits above the page (not inline in the header
        // flow), so opening it no longer pushes the rest of the page
        // down. The backdrop blurs/dims everything below the header,
        // same modal pattern as VisitorSidebar's old mobile drawer.
        <div className="fixed inset-x-0 top-16 bottom-0 z-40 lg:hidden">
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
                {navLinks.map((link) => {
                  const active = isActiveLink(link.href);
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => setIsMobileMenuOpen(false)}
                      className={cn(
                        'rounded-lg px-2 py-2',
                        active ? 'bg-brand-primary/10 text-brand-primary' : 'hover:bg-brand-primary/5'
                      )}
                    >
                      {link.label}
                    </Link>
                  );
                })}
              </nav>
            )}

            {isAuthenticated && user && !isStaffArea && (
              // Only the profile and logout actions belong here -- unlike
              // the desktop trigger button, this collapsed panel doesn't
              // surface the visitor's name. Skipped entirely on /staff/*
              // routes for the same reason as the desktop trigger above:
              // StaffSidebar already has these.
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
