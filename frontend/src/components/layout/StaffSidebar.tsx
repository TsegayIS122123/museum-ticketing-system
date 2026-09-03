'use client';

import { usePathname, useRouter } from 'next/navigation';
import Image from 'next/image';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { cn } from '@/lib/utils/cn';
import type { UserRole } from '@/lib/auth/roles';
import { isStaff } from '@/lib/auth/roles';

interface NavItem {
  view: string;
  label: string;
  icon: string;
  path: string;
}

const navByRole: Record<UserRole, NavItem[]> = {
  visitor: [],
  cashier: [
    { view: 'gate', label: 'Gate Check-In', icon: '🚪', path: '/staff/gate' },
    { view: 'settlement', label: 'Settlement', icon: '🏦', path: '/staff/settlement' },
    { view: 'profile', label: 'Profile', icon: '👤', path: '/staff/profile' },
  ],
  museum_manager: [
    { view: 'dashboard', label: 'Dashboard', icon: '📊', path: '/staff/dashboard' },
    { view: 'categories', label: 'Ticket Categories & Pricing', icon: '💲', path: '/staff/categories' },
    { view: 'availability', label: 'Availability', icon: '📅', path: '/staff/availability' },
    { view: 'group-bookings', label: 'Group Booking Approvals', icon: '👥', path: '/staff/group-bookings' },
    { view: 'refunds', label: 'Refunds', icon: '💰', path: '/staff/refunds' },
    { view: 'reports', label: 'Reports', icon: '📈', path: '/staff/reports' },
    { view: 'profile', label: 'Profile', icon: '👤', path: '/staff/profile' },
  ],
  platform_admin: [
    { view: 'staff', label: 'Staff Accounts', icon: '👤', path: '/staff/admin/staff' },
    { view: 'profile', label: 'Profile', icon: '👤', path: '/staff/profile' },
  ],
};

const roleInfo: Record<UserRole, { name: string; badge: string; initials: string; badgeColor: string }> = {
  visitor: { name: 'Visitor', badge: 'Visitor', initials: 'V', badgeColor: 'bg-blue-500/20 text-blue-200' },
  cashier: { name: 'Cashier', badge: 'Cashier', initials: 'C', badgeColor: 'bg-emerald-500/20 text-emerald-200' },
  museum_manager: { name: 'Manager', badge: 'Museum Manager', initials: 'M', badgeColor: 'bg-primary-500/20 text-primary-200' },
  platform_admin: { name: 'Admin', badge: 'Platform Admin', initials: 'A', badgeColor: 'bg-purple-500/20 text-purple-200' },
};

export function StaffSidebar() {
  const { t, locale } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();

  if (!user || !isStaff(user.role)) {
    return null;
  }

  const navItems = navByRole[user.role] || [];
  const info = roleInfo[user.role];

  const handleSignOut = () => {
    logout();
    router.push(`/${locale}`);
  };

  const isActive = (path: string) => {
    return pathname?.includes(path) || false;
  };

  return (
    <aside className="w-60 bg-brand-primary flex flex-col flex-shrink-0 h-full">
      {/* Logo */}
      <div className="p-5 border-b border-white/20">
        <div className="flex items-center gap-3">
          <Image
            src="/aau-logo.png"
            alt="Addis Ababa University"
            width={36}
            height={36}
            className="rounded-lg flex-shrink-0"
          />
          <div>
            <div className="text-white font-semibold text-sm leading-tight">
              Science Museum
            </div>
            <div className="text-white/65 text-xs">Staff Portal</div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto">
        <div className="px-4 mb-2 text-xs font-semibold text-white/60 uppercase tracking-wider">
          {info.badge}
        </div>
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.view}
              onClick={() => router.push(`/${locale}${item.path}`)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-all text-left cursor-pointer rounded-none',
                active
                  ? 'bg-primary-600 text-white'
                  : 'text-white/75 hover:bg-white/10 hover:text-white'
              )}
            >
              <span className="text-base w-5 text-center">{item.icon}</span>
              {item.label}
            </button>
          );
        })}
      </nav>

      {/* User */}
      <div className="p-4 border-t border-white/20">
        <div className="flex items-center gap-3 mb-3">
          <div className="w-8 h-8 bg-white/20 rounded-full flex items-center justify-center text-xs font-bold text-white flex-shrink-0">
            {info.initials}
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-white truncate">
              {user.full_name || info.name}
            </div>
            <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', info.badgeColor)}>
              {info.badge}
            </span>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full text-xs text-white/65 hover:text-white transition-colors py-1 text-left cursor-pointer"
        >
          ← Sign Out
        </button>
      </div>
    </aside>
  );
}
