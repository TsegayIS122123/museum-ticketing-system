'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { GroupBookingRequest } from '../api';

interface ApprovalQueueTableProps {
  requests: GroupBookingRequest[];
  isLoading?: boolean;
  onReview: (id: string) => void;
  onRefresh?: () => void;
}

export function ApprovalQueueTable({
  requests,
  isLoading = false,
  onReview,
  onRefresh,
}: ApprovalQueueTableProps) {
  const { t, locale } = useTranslation();

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'am-ET', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <StatusBadge status="pending_approval" />;
      case 'approved':
        return <StatusBadge status="pending" />;
      case 'declined':
        return <StatusBadge status="cancelled" />;
      default:
        return <StatusBadge status="pending_approval" />;
    }
  };

  if (isLoading) {
    return (
      <Card className="animate-pulse">
        <div className="h-40 bg-stone-100 rounded" />
      </Card>
    );
  }

  if (requests.length === 0) {
    return (
      <EmptyState
        icon="📋"
        title={t('no_pending_requests') || 'No Pending Requests'}
        description={t('no_pending_requests_description') || 'All group booking requests have been reviewed.'}
      />
    );
  }

  const headers = [
    t('organization') || 'Organization',
    t('contact') || 'Contact',
    t('visit_date') || 'Visit Date',
    t('group_size') || 'Size',
    t('status') || 'Status',
    t('actions') || 'Actions',
  ];

  const rows = requests.map((request) => [
    <div key="org" className="font-medium text-stone-900">
      {request.organizationName}
    </div>,
    <div key="contact">
      <div className="text-sm font-medium">{request.contactPerson}</div>
      <div className="text-xs text-stone-400">{request.contactPhone}</div>
    </div>,
    <div key="date" className="text-sm">
      {formatDate(request.visitDate)}
      <div className="text-xs text-stone-400">{request.visitTime}</div>
    </div>,
    <div key="size" className="font-semibold text-stone-900">
      {request.groupSize}
    </div>,
    getStatusBadge(request.status),
    <div key="actions">
      {request.status === 'pending' ? (
        <Button
          size="sm"
          onClick={() => onReview(request.id)}
        >
          {t('review') || 'Review'}
        </Button>
      ) : (
        <Button
          size="sm"
          variant="secondary"
          onClick={() => onReview(request.id)}
        >
          {t('view') || 'View'}
        </Button>
      )}
    </div>,
  ]);

  return (
    <div className="space-y-4">
      {onRefresh && (
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={onRefresh}>
            🔄 {t('refresh') || 'Refresh'}
          </Button>
        </div>
      )}
      <Card padding={false}>
        <Table headers={headers} rows={rows} />
      </Card>
    </div>
  );
}
