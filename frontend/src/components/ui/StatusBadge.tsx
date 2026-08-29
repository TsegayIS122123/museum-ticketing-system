'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';

export type BookingStatus = 
  | 'awaiting_payment'
  | 'pending_approval'
  | 'pending'
  | 'visited'
  | 'cancelled'
  | 'refunded';

const statusConfig: Record<BookingStatus, { color: string; labelKey: string }> = {
  awaiting_payment: { 
    color: 'bg-yellow-100 text-yellow-800 border-yellow-200', 
    labelKey: 'awaiting_payment' 
  },
  pending_approval: { 
    color: 'bg-purple-100 text-purple-800 border-purple-200', 
    labelKey: 'pending_approval' 
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
