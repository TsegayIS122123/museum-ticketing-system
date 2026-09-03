'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';

export function SiteHeader() {
  const { t, locale } = useTranslation();
  const { user, isAuthenticated, logout } = useAuth();
  const router = useRouter();
  const [isProfileOpen, setIsProfileOpen] = useState(false);

  const handleSignOut = () => {
    logout();
    router.push(`/${locale}`);
  };

  const profilePath = user?.role === 'visitor' ? `/${locale}/profile` : `/${locale}/staff/profile`;

  return (
    <header className="border-b border-brand-primary/15 bg-white">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6 lg:px-8">
        <Link href={`/${locale}`} className="flex shrink-0 items-center gap-3">
          <Image src="/aau-logo.png" alt="Addis Ababa University" width={40} height={40} priority />
          <span className="font-serif text-xl font-bold text-brand-primary">{t('museum_name')}</span>
        </Link>

        {isAuthenticated && user ? (
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
        ) : (
          <nav aria-label="Primary" className="flex items-center gap-4 text-sm font-semibold text-brand-primary">
            <Link href={`/${locale}#about`} className="hover:underline">{t('about') || 'About'}</Link>
            <Link href={`/${locale}#solutions`} className="hover:underline">{t('solutions') || 'Solutions'}</Link>
            <Link href={`/${locale}/book`} className="hover:underline">{t('booking') || 'Booking'}</Link>
            <Link href={`/${locale}#contact`} className="hover:underline">{t('contact') || 'Contact'}</Link>
          </nav>
        )}
      </div>
    </header>
  );
}
