'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { StatCard } from '@/components/ui/StatCard';
import { getRefunds, type Refund } from '@/features/refunds/api';

export default function RefundsPage() {
  const { t } = useTranslation();
  const [refunds, setRefunds] = useState<Refund[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    getRefunds()
      .then((res) => {
        if (!cancelled) setRefunds(res.data);
      })
      .catch((err: any) => {
        if (!cancelled) setError(err.message || 'Failed to load refunds');
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const getReasonLabel = (reason: string) => {
    switch (reason) {
      case 'cancellation':
        return t('cancellation') || 'Cancellation';
      case 'partial_shortfall':
        return t('partial_shortfall') || 'Partial Shortfall';
      case 'no_response':
        return t('no_response') || 'No Response';
      default:
        return reason;
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'completed':
        return <StatusBadge status="visited" />;
      case 'pending':
        return <StatusBadge status="pending" />;
      case 'failed':
        return <StatusBadge status="cancelled" />;
      default:
        return <StatusBadge status="pending" />;
    }
  };

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString('en-US', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const totalAmount = refunds.reduce((sum, r) => sum + parseFloat(r.amountEtb || '0'), 0);
  const pendingCount = refunds.filter(r => r.status === 'pending').length;
  const completedCount = refunds.filter(r => r.status === 'completed').length;

  const headers = [
    t('reference') || 'Reference',
    t('booking') || 'Booking',
    t('amount') || 'Amount',
    t('reason') || 'Reason',
    t('status') || 'Status',
    t('date') || 'Date',
  ];

  const rows = refunds.map((refund) => [
    <span key="ref" className="font-mono text-sm font-medium text-stone-600">
      {refund.id}
    </span>,
    <span key="booking" className="font-mono text-sm text-stone-500">
      {refund.bookingId}
    </span>,
    <div key="amount" className="font-bold text-primary-600">
      ETB {refund.amountEtb}
    </div>,
    <div key="reason" className="text-sm text-stone-500">
      {getReasonLabel(refund.reason)}
    </div>,
    getStatusBadge(refund.status),
    <div key="date" className="text-sm text-stone-400">
      {formatDateTime(refund.createdAt)}
    </div>,
  ]);

  return (
    <PageContainer>
      <div className="mb-6">
        <h1 className="font-serif text-3xl text-stone-900">
          {t('refunds') || 'Refunds'}
        </h1>
        <p className="text-stone-500 mt-1">
          {t('refunds_description') || 'View and manage visitor refund requests'}
        </p>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard
          label={t('total_refunds') || 'Total Refunds'}
          value={`ETB ${totalAmount}`}
          sub={`${refunds.length} requests`}
          color="primary"
        />
        <StatCard
          label={t('pending') || 'Pending'}
          value={pendingCount}
          color="red"
        />
        <StatCard
          label={t('completed') || 'Completed'}
          value={completedCount}
          color="green"
        />
      </div>

      <Card padding={false}>
        <div className="p-5 border-b border-stone-200 flex justify-between items-center">
          <div className="font-semibold text-stone-900">
            {t('refund_requests') || 'Refund Requests'}
          </div>
          <Button variant="secondary" size="sm">
            ⬇ {t('export') || 'Export'}
          </Button>
        </div>
        {isLoading ? (
          <div className="p-8 text-center text-stone-500">{t('loading') || 'Loading...'}</div>
        ) : error ? (
          <div className="p-8 text-center text-red-600">{error}</div>
        ) : (
          <Table headers={headers} rows={rows} />
        )}
      </Card>
    </PageContainer>
  );
}
