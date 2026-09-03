'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { cn } from '@/lib/utils/cn';
import { useAuth } from '@/lib/auth/auth-context';

const items = [
  { label: 'My Bookings', path: '/bookings' },
  { label: 'Book a Visit', path: '/book' },
  { label: 'Profile', path: '/settings/account' },
];

export function VisitorSidebar() {
  const { locale } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const { user } = useAuth();

  if (!user || user.role !== 'visitor') return null;

  return (
    <aside className="w-60 shrink-0 bg-brand-primary text-white">
      <div className="border-b border-white/20 p-5">
        <p className="text-sm font-semibold">Visitor Portal</p>
        <p className="mt-1 truncate text-xs text-white/70">{user.full_name || user.email}</p>
      </div>
      <nav className="space-y-1 p-3" aria-label="Visitor navigation">
        {items.map((item) => (
          <button
            key={item.path}
            type="button"
            onClick={() => router.push(`/${locale}${item.path}`)}
            className={cn(
              'min-h-11 w-full px-3 py-2 text-left text-sm font-medium',
              pathname?.includes(item.path) ? 'bg-white/20 text-white' : 'text-white/75 hover:bg-white/10 hover:text-white'
            )}
          >
            {item.label}
          </button>
        ))}
      </nav>
    </aside>
  );
}
