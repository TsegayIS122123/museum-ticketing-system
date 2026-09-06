'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Menu, X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { LanguageToggle } from '@/components/ui/LanguageToggle';

export function SiteHeader() {
  const { t, locale } = useTranslation();
  const { user, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const [isProfileOpen, setIsProfileOpen] = useState(false);
  // The logged-out primary nav (About/Solutions/Booking/Contact) plus the
  // language toggle doesn't fit next to the logo below `md` -- it's
  // collapsed into this toggle-able panel instead of wrapping onto the
  // logo's line.
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const handleSignOut = () => {
    logout();
    router.push(`/${locale}`);
  };

  const profilePath = `/${locale}/settings/account`;

  const navLinks = [
    { href: `/${locale}#about`, label: t('about') || 'About' },
    { href: `/${locale}#solutions`, label: t('solutions') || 'Solutions' },
    { href: `/${locale}/book`, label: t('booking') || 'Booking' },
    { href: `/${locale}#contact`, label: t('contact') || 'Contact' },
  ];

  return (
    <header className="border-b border-brand-primary/15 bg-white">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:gap-6 sm:px-6 lg:px-8">
        <Link href={`/${locale}`} className="flex shrink-0 items-center gap-3">
          <Image src="/aau-logo.png" alt={t('aau_logo_alt') || 'Addis Ababa University'} width={40} height={40} priority />
          <span className="font-serif text-lg font-bold text-brand-primary sm:text-xl">{t('museum_name')}</span>
        </Link>

        {isAuthenticated && user ? (
          <div className="flex items-center gap-2 sm:gap-4">
            <LanguageToggle />
            <div className="relative">
            <button
              type="button"
              onClick={() => setIsProfileOpen((open) => !open)}
              aria-expanded={isProfileOpen}
              aria-haspopup="menu"
              className="flex items-center gap-2 text-sm font-semibold text-brand-primary"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-brand-primary text-xs text-white">
                {(user.full_name || user.email).charAt(0).toUpperCase()}
              </span>
              <span className="hidden sm:inline">{user.full_name || user.email}</span>
            </button>
            {isProfileOpen && (
              <div role="menu" className="absolute right-0 z-20 mt-2 min-w-44 rounded-lg border border-stone-200 bg-white p-1 shadow-lg">
                <Link href={profilePath} role="menuitem" onClick={() => setIsProfileOpen(false)} className="block rounded px-3 py-2 text-sm text-stone-700 hover:bg-stone-100">
                  {t('profile') || 'Profile'}
                </Link>
                <button type="button" role="menuitem" onClick={handleSignOut} className="block w-full rounded px-3 py-2 text-left text-sm text-stone-700 hover:bg-stone-100">
                  {t('logout') || 'Logout'}
                </button>
              </div>
            )}
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 sm:gap-4">
            <nav aria-label={t('primary_navigation') || 'Primary'} className="hidden items-center gap-4 text-sm font-semibold text-brand-primary md:flex">
              {navLinks.map((link) => (
                <Link key={link.href} href={link.href} className="hover:underline">
                  {link.label}
                </Link>
              ))}
            </nav>
            <div className="hidden sm:block">
              <LanguageToggle />
            </div>
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
        )}
      </div>

      {!isAuthenticated && isMobileMenuOpen && (
        <div id="mobile-primary-nav" className="border-t border-brand-primary/15 px-4 py-3 md:hidden">
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
          <div className="mt-3 border-t border-brand-primary/10 pt-3 sm:hidden">
            <LanguageToggle />
          </div>
        </div>
      )}
    </header>
  );
}
