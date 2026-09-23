'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import {
  Menu,
  X,
  DoorOpen,
  Landmark,
  User,
  LayoutDashboard,
  Tag,
  Calendar,
  Wallet,
  TrendingUp,
  Users,
  Flag,
  LogOut,
  type LucideIcon,
} from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { cn } from '@/lib/utils/cn';
import type { UserRole } from '@/lib/auth/roles';
import { isStaff } from '@/lib/auth/roles';

interface NavItem {
  view: string;
  labelKey: string;
  labelFallback: string;
  icon: LucideIcon;
  path: string;
}

const navByRole: Record<UserRole, NavItem[]> = {
  visitor: [],
  cashier: [
    { view: 'gate', labelKey: 'nav_gate_check_in', labelFallback: 'Gate Check-In', icon: DoorOpen, path: '/staff/gate' },
    { view: 'settlement', labelKey: 'settlement', labelFallback: 'Settlement', icon: Landmark, path: '/staff/settlement' },
    { view: 'profile', labelKey: 'profile', labelFallback: 'Profile', icon: User, path: '/settings/account' },
  ],
  museum_manager: [
    { view: 'dashboard', labelKey: 'dashboard', labelFallback: 'Dashboard', icon: LayoutDashboard, path: '/staff/dashboard' },
    { view: 'attendance', labelKey: 'nav_flagged_bookings', labelFallback: 'Flagged Bookings', icon: Flag, path: '/staff/attendance' },
    { view: 'categories', labelKey: 'nav_ticket_categories_pricing', labelFallback: 'Ticket Categories & Pricing', icon: Tag, path: '/staff/categories' },
    { view: 'availability', labelKey: 'nav_availability', labelFallback: 'Availability', icon: Calendar, path: '/staff/availability' },
    { view: 'refunds', labelKey: 'nav_refunds', labelFallback: 'Refunds', icon: Wallet, path: '/staff/refunds' },
    { view: 'reports', labelKey: 'nav_reports', labelFallback: 'Reports', icon: TrendingUp, path: '/staff/reports' },
    { view: 'profile', labelKey: 'profile', labelFallback: 'Profile', icon: User, path: '/settings/account' },
  ],
  platform_admin: [
    { view: 'staff', labelKey: 'nav_staff_accounts', labelFallback: 'Staff Accounts', icon: Users, path: '/staff/admin/staff' },
    { view: 'profile', labelKey: 'profile', labelFallback: 'Profile', icon: User, path: '/settings/account' },
  ],
};

const roleInfo: Record<UserRole, { nameKey: string; nameFallback: string; badgeKey: string; badgeFallback: string; initials: string; badgeColor: string }> = {
  visitor: { nameKey: 'role_visitor', nameFallback: 'Visitor', badgeKey: 'role_visitor', badgeFallback: 'Visitor', initials: 'V', badgeColor: 'bg-blue-500/20 text-blue-200' },
  cashier: { nameKey: 'role_cashier', nameFallback: 'Cashier', badgeKey: 'role_cashier', badgeFallback: 'Cashier', initials: 'C', badgeColor: 'bg-emerald-500/20 text-emerald-200' },
  museum_manager: { nameKey: 'nav_manager_short', nameFallback: 'Manager', badgeKey: 'role_museum_manager', badgeFallback: 'Museum Manager', initials: 'M', badgeColor: 'bg-primary-500/20 text-primary-200' },
  platform_admin: { nameKey: 'nav_admin_short', nameFallback: 'Admin', badgeKey: 'role_platform_admin', badgeFallback: 'Platform Admin', initials: 'A', badgeColor: 'bg-purple-500/20 text-purple-200' },
};

export function StaffSidebar() {
  const { t, locale } = useTranslation();
  const pathname = usePathname();
  const router = useRouter();
  const { user, logout } = useAuth();
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

  if (!user || !isStaff(user.role)) {
    return null;
  }

  const navItems = navByRole[user.role] || [];
  const info = roleInfo[user.role];

  const handleSignOut = () => {
    setIsMobileOpen(false);
    logout();
    router.push(`/${locale}`);
  };

  const isActive = (path: string) => {
    return pathname?.includes(path) || false;
  };

  const handleNavigate = (path: string) => {
    setIsMobileOpen(false);
    router.push(`/${locale}${path}`);
  };

  const sidebarBody = (
    <>
      {/* The global SiteHeader above already shows the logo + museum name,
          so this only needs to identify the portal, not repeat them. */}
      <div className="p-5 border-b border-white/20">
        <p className="text-sm font-semibold text-white">{t('staff_portal') || 'Staff Portal'}</p>
      </div>

      {/* Navigation */}
      <nav className="flex-1 py-3 overflow-y-auto">
        <div className="px-4 mb-2 text-xs font-semibold text-white/60 uppercase tracking-wider">
          {t(info.badgeKey) || info.badgeFallback}
        </div>
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <button
              key={item.view}
              onClick={() => handleNavigate(item.path)}
              className={cn(
                'w-full flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors text-left cursor-pointer',
                active
                  ? 'bg-white/20 text-white'
                  : 'text-white/75 hover:bg-white/10 hover:text-white'
              )}
            >
              <item.icon className="w-4 h-4 flex-shrink-0" />
              {t(item.labelKey) || item.labelFallback}
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
              {user.full_name || t(info.nameKey) || info.nameFallback}
            </div>
            <span className={cn('text-xs px-1.5 py-0.5 rounded font-medium', info.badgeColor)}>
              {t(info.badgeKey) || info.badgeFallback}
            </span>
          </div>
        </div>
        <button
          onClick={handleSignOut}
          className="w-full flex items-center gap-2 text-xs text-red-300 hover:text-red-200 transition-colors py-1 text-left cursor-pointer"
        >
          <LogOut className="w-3.5 h-3.5" /> {t('logout') || 'Logout'}
        </button>
      </div>
    </>
  );

  return (
    <>
      {/* Mobile top bar -- in-flow (not `fixed`), only rendered below
          `md` since the sidebar itself is always visible from `md` up.
          This used to be a `fixed` circular button pinned to the
          viewport; since `main` scrolls independently
          (`overflow-auto` in staff/layout.tsx), a `fixed` button stayed
          on screen at all times and sat on top of whatever page content
          happened to be underneath it, regardless of scroll position.
          Rendering it as a normal block above `main` (staff/layout.tsx
          now stacks them with `flex-col` on mobile) means it takes up
          its own row and never overlays the scrollable content below. */}
      <div className="flex items-center justify-between bg-brand-primary px-4 py-3 md:hidden">
        <span className="text-sm font-semibold text-white">{t('staff_portal') || 'Staff Portal'}</span>
        <button
          type="button"
          onClick={() => setIsMobileOpen(true)}
          aria-label={t('open_nav_menu') || 'Open navigation menu'}
          aria-expanded={isMobileOpen}
          className="flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white"
        >
          <Menu className="h-5 w-5" />
        </button>
      </div>

      {/* Mobile drawer */}
      {isMobileOpen && (
        <div className="fixed inset-0 z-40 md:hidden" role="dialog" aria-modal="true">
          <div
            className="absolute inset-0 bg-black/40"
            onClick={() => setIsMobileOpen(false)}
          />
          <aside className="relative flex h-full w-64 max-w-[80vw] flex-col bg-brand-primary shadow-xl">
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
      <aside className="hidden md:flex w-60 bg-brand-primary flex-col flex-shrink-0 h-full">
        {sidebarBody}
      </aside>
    </>
  );
}
