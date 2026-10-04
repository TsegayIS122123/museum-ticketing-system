'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { ChevronDown, LogOut, Menu, User, X } from 'lucide-react';
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
  const profileRef = useRef<HTMLDivElement>(null);

  // Close the profile dropdown on an outside click or Escape --
  // previously it stayed open until the trigger was clicked again.
  useEffect(() => {
    if (!isProfileOpen) return;
    const onPointerDown = (e: MouseEvent) => {
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) {
        setIsProfileOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsProfileOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isProfileOpen]);

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
    <header className="site-header relative z-50 pt-[env(safe-area-inset-top)]">
      <div className="header-accent" aria-hidden="true" />
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6 lg:px-8">
        <Link
          href={`/${locale}`}
          className="group flex min-w-0 items-center gap-2.5 rounded-xl py-1 pr-2 sm:gap-3"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-sm ring-2 sm:h-11 sm:w-11 ring-sky-400/40 transition-shadow group-hover:ring-sky-400/80">
            <Image src="/aau-logo.png" alt={t('aau_logo_alt') || 'Addis Ababa University'} width={36} height={36} priority className="h-9 w-9 object-contain" />
          </span>
          <span className="truncate font-serif text-base font-bold tracking-tight text-brand-primary sm:text-lg lg:text-xl">{t('museum_name')}</span>
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
            <nav aria-label={t('primary_navigation') || 'Primary'} className="hidden h-full items-center gap-1.5 text-sm font-semibold leading-none text-brand-primary lg:flex">
              {navLinks.map((link) => {
                const active = isActiveLink(link.href);
                return (
                  <Link
                    key={link.href}
                    href={link.href}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'inline-flex items-center rounded-full px-4 py-2 leading-none transition-colors',
                      active
                        ? 'bg-brand-primary text-white shadow-sm'
                        : 'text-brand-primary/80 hover:bg-brand-primary/10 hover:text-brand-primary'
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
            <div ref={profileRef} className="relative hidden h-full items-center lg:flex">
              <button
                type="button"
                onClick={() => setIsProfileOpen((open) => !open)}
                aria-expanded={isProfileOpen}
                aria-haspopup="menu"
                className="flex max-w-[12rem] items-center gap-2 rounded-full border border-brand-primary/15 bg-white/80 py-1 pl-1 pr-3 text-sm font-semibold text-brand-primary shadow-sm transition-colors hover:border-brand-primary/30 hover:bg-white"
              >
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary-500 to-primary-700 text-xs font-bold text-white">
                  {displayName.charAt(0).toUpperCase()}
                </span>
                <span className="truncate">{displayName}</span>
                <ChevronDown className={cn('h-4 w-4 shrink-0 transition-transform', isProfileOpen && 'rotate-180')} aria-hidden="true" />
              </button>
              {isProfileOpen && (
                <div role="menu" className="absolute right-0 top-full z-20 mt-1 min-w-48 rounded-xl border border-stone-200 bg-white p-1.5 shadow-xl shadow-primary-900/10">
                  <Link href={profilePath} role="menuitem" onClick={() => setIsProfileOpen(false)} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-stone-700 hover:bg-primary-50">
                    <User className="h-4 w-4 text-brand-primary" aria-hidden="true" /> {t('profile') || 'Profile'}
                  </Link>
                  <button type="button" role="menuitem" onClick={handleSignOut} className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm font-medium text-red-600 hover:bg-red-50">
                    <LogOut className="h-4 w-4" aria-hidden="true" /> {t('logout') || 'Logout'}
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
        <div className="fixed inset-x-0 top-[calc(68px+env(safe-area-inset-top))] bottom-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsMobileMenuOpen(false)}
          />
          <div
            id="mobile-primary-nav"
            className="relative max-h-full overflow-y-auto overscroll-contain rounded-b-2xl border-t border-brand-primary/15 bg-white px-3 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-xl"
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
                        'flex min-h-12 items-center rounded-xl px-3 text-base',
                        active ? 'bg-brand-primary text-white' : 'active:bg-brand-primary/10 hover:bg-brand-primary/5'
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
                  className="flex min-h-12 items-center gap-2 rounded-xl px-3 text-base font-semibold text-brand-primary hover:bg-brand-primary/5"
                >
                  <User className="h-5 w-5" aria-hidden="true" /> {t('profile') || 'Profile'}
                </Link>
                <button
                  type="button"
                  onClick={handleSignOut}
                  className="flex min-h-12 w-full items-center gap-2 rounded-xl px-3 text-left text-base font-semibold text-red-600 hover:bg-red-50"
                >
                  <LogOut className="h-5 w-5" aria-hidden="true" /> {t('logout') || 'Logout'}
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
