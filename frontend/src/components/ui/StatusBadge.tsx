'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';

export type BookingStatus = 
  | 'awaiting_payment'
  | 'pending'
  | 'visited'
  | 'cancelled'
  | 'refunded'
  | 'active'
  | 'inactive';

const statusConfig: Record<BookingStatus, { color: string; labelKey: string }> = {
  awaiting_payment: { 
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200', 
    labelKey: 'awaiting_payment' 
  },
  pending: { 
    color: 'bg-blue-100 text-blue-800 border-blue-200', 
    labelKey: 'pending' 
  },
  visited: { 
    color: 'bg-green-100 text-green-800 border-green-200', 
    labelKey: 'visited' 
  },
  cancelled: { 
    color: 'bg-gray-100 text-gray-800 border-gray-200', 
    labelKey: 'cancelled' 
  },
  refunded: { 
    color: 'bg-red-100 text-red-800 border-red-200', 
    labelKey: 'refunded' 
  },
  // Category active/inactive -- distinct from the booking-lifecycle
  // statuses above (a category is never "pending" or "cancelled", it's
  // just on or off for booking).
  active: {
    color: 'bg-green-100 text-green-800 border-green-200',
    labelKey: 'active',
  },
  inactive: {
    color: 'bg-gray-100 text-gray-800 border-gray-200',
    labelKey: 'inactive',
  },
};

interface StatusBadgeProps {
  status: BookingStatus;
  className?: string;
}

export function StatusBadge({ status, className = '' }: StatusBadgeProps) {
  const { t } = useTranslation();
  const config = statusConfig[status];

  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium border ${config.color} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-current opacity-50" />
      {t(config.labelKey)}
    </span>
  );
}
