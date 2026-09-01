'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import type { Booking } from '../api';

interface ApprovalQueueTableProps {
  requests: Booking[];
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

  // Real backend model: pending review = status 'pending_approval' with
  // approvalStatus still null. Once a Museum Manager decides,
  // approvalStatus becomes 'approved'/'declined' (status moves on to
  // awaiting_payment or cancelled accordingly).
  const getStatusBadge = (booking: Booking) => {
    if (booking.approvalStatus === 'approved') return <StatusBadge status="pending" />;
    if (booking.approvalStatus === 'declined') return <StatusBadge status="cancelled" />;
    return <StatusBadge status="pending_approval" />;
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
    t('reference') || 'Reference',
    t('group_name') || 'Group',
    t('visit_date') || 'Visit Date',
    t('group_size') || 'Size',
    t('status') || 'Status',
    t('actions') || 'Actions',
  ];

  const rows = requests.map((request) => [
    <div key="ref" className="font-mono text-sm text-stone-700">
      {request.reference}
    </div>,
    <div key="group" className="text-sm font-medium">
      {/* No contact phone/email/person is ever returned on a Booking --
          only what was submitted at create time (groupName), which
          itself is optional. To actually reach the requester, staff
          would need a way to look up the visitor account by visitorId,
          which the contract doesn't expose either -- a real gap. */}
      {request.groupName || '—'}
    </div>,
    <div key="date" className="text-sm">
      {formatDate(request.visitDate)}
    </div>,
    <div key="size" className="font-semibold text-stone-900">
      {request.bookedQuantity}
    </div>,
    getStatusBadge(request),
    <div key="actions">
      {request.approvalStatus === null ? (
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
