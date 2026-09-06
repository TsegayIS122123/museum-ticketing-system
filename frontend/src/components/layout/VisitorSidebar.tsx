'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { Menu, X } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { cn } from '@/lib/utils/cn';
import { useAuth } from '@/lib/auth/auth-context';

const items = [
  { labelKey: 'nav_my_bookings', labelFallback: 'My Bookings', path: '/bookings' },
  { labelKey: 'nav_book_a_visit', labelFallback: 'Book a Visit', path: '/book' },
  { labelKey: 'profile', labelFallback: 'Profile', path: '/settings/account' },
];

export function VisitorSidebar() {
  const { t, locale } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();
  // Sidebar collapses into an off-canvas drawer below the `md` breakpoint
  // -- this only tracks whether that drawer is open; the desktop
  // (`md:flex`) rendering below is never affected by it.
  const [isMobileOpen, setIsMobileOpen] = useState(false);

  // Lock background scroll while the drawer is open, same approach as
  // components/ui/Modal.tsx.
  useEffect(() => {
    document.body.style.overflow = isMobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [isMobileOpen]);

  if (!user || user.role !== 'visitor') return null;

  const handleNavigate = (path: string) => {
    setIsMobileOpen(false);
    router.push(`/${locale}${path}`);
  };

  const sidebarBody = (
    <>
      <div className="border-b border-white/20 p-5">
        <p className="text-sm font-semibold">{t('visitor_portal') || 'Visitor Portal'}</p>
        <p className="mt-1 truncate text-xs text-white/70">{user.full_name || user.email}</p>
      </div>
      <nav className="space-y-1 p-3" aria-label={t('visitor_navigation') || 'Visitor navigation'}>
        {items.map((item) => (
          <button
            key={item.path}
            type="button"
            onClick={() => handleNavigate(item.path)}
            className={cn(
              'min-h-11 w-full px-4 py-2.5 text-left text-sm font-medium transition-colors',
              pathname?.includes(item.path) ? 'bg-white/20 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
            )}
          >
            {t(item.labelKey) || item.labelFallback}
          </button>
        ))}
      </nav>
    </>
  );

  return (
    <>
      {/* Mobile toggle -- fixed so it stays reachable regardless of scroll
          position, and only rendered below `md` since the sidebar itself
          is always visible from `md` up. */}
      <button
        type="button"
        onClick={() => setIsMobileOpen(true)}
        aria-label={t('open_nav_menu') || 'Open navigation menu'}
        aria-expanded={isMobileOpen}
        className="fixed left-4 top-20 z-30 flex h-11 w-11 items-center justify-center rounded-full bg-brand-primary text-white shadow-lg md:hidden"
      >
        <Menu className="h-5 w-5" />
      </button>

      {/* Mobile drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsMobileOpen(false)}
          />
          <aside className="relative flex h-full w-64 max-w-[80vw] flex-col bg-brand-primary text-white shadow-xl">
            <button
              type="button"
              onClick={() => setIsMobileOpen(false)}
              aria-label={t('close_nav_menu') || 'Close navigation menu'}
              className="absolute right-3 top-3 flex h-8 w-8 items-center justify-center rounded-full text-white/80 hover:bg-white/10 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
            {sidebarBody}
          </aside>
        </div>
      )}

      {/* Desktop sidebar */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col bg-brand-primary text-white">
        {sidebarBody}
      </aside>
    </>
  );
}
