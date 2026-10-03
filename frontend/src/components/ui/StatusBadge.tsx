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
    color: 'bg-sun-300/40 text-amber-900 border-sun-400/70', 
    labelKey: 'awaiting_payment' 
  },
  pending: { 
    color: 'bg-sky-400/20 text-primary-800 border-sky-400/70', 
    labelKey: 'pending' 
  },
  visited: { 
    color: 'bg-leaf-300/40 text-leaf-600 border-leaf-400/70', 
    labelKey: 'visited' 
  },
  cancelled: { 
    color: 'bg-gray-100 text-gray-800 border-gray-200', 
    labelKey: 'cancelled' 
  },
  refunded: { 
    color: 'bg-coral-300/30 text-red-800 border-coral-400/70', 
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
      className={`inline-flex items-center rounded-full px-3 py-1 text-xs font-semibold border ${config.color} ${className}`}
    >
      <span className="w-1.5 h-1.5 rounded-full mr-1.5 bg-current opacity-50" />
      {t(config.labelKey)}
    </span>
  );
}
