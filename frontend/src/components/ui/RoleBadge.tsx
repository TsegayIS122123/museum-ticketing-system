'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';
import { getRoleDisplayName } from '@/lib/auth/roles';
import type { UserRole } from '@/lib/auth/roles';

// Distinct from StatusBadge (booking-lifecycle statuses like `pending` /
// `awaiting_payment` / `visited`) -- a staff account's *role* isn't a
// status at all, so it gets its own color set and its own label source
// (`getRoleDisplayName`, the same helper ProfilePage/StaffSidebar already
// use) instead of borrowing whichever booking-status word happened to
// look plausible.
const roleColor: Record<UserRole, string> = {
  visitor: 'bg-blue-100 text-blue-800 border-blue-200',
  cashier: 'bg-emerald-100 text-emerald-800 border-emerald-200',
  museum_manager: 'bg-indigo-100 text-indigo-800 border-indigo-200',
  platform_admin: 'bg-purple-100 text-purple-800 border-purple-200',
};

interface RoleBadgeProps {
  role: UserRole;
  className?: string;
}

export function RoleBadge({ role, className = '' }: RoleBadgeProps) {
  const { t } = useTranslation();

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${roleColor[role]} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-current opacity-50" />
      {getRoleDisplayName(role, t)}
    </span>
  );
}
