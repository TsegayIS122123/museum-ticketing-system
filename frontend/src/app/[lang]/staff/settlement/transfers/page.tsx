'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { getSettlementTransfers, type SettlementTransfer } from '@/features/settlement/api';

export default function SettlementTransfersPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();

  const [transfers, setTransfers] = useState<SettlementTransfer[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadTransfers = async () => {
    setIsLoading(true);
    try {
      const data = await getSettlementTransfers();
      setTransfers(data);
    } catch (error) {
      console.error('Failed to load transfers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTransfers();
  }, []);

  const formatDateTime = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString(locale === 'en' ? 'en-US' : 'am-ET', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (isLoading) {
    return (
      <PageContainer>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-stone-200 rounded w-48" />
          <div className="h-40 bg-stone-200 rounded-xl" />
        </div>
      </PageContainer>
    );
  }

  if (transfers.length === 0) {
    return (
      <PageContainer>
        <div className="mb-6">
          <h1 className="font-serif text-3xl text-stone-900">
            {t('settlement_history') || 'Settlement History'}
          </h1>
          <p className="text-stone-500 mt-1">
            {t('settlement_history_description') || 'View all past settlement transfers'}
          </p>
        </div>
        <EmptyState
          icon="📜"
          title={t('no_transfers') || 'No Transfers Yet'}
          description={t('no_transfers_description') || 'Settlement transfers will appear here once initiated.'}
          action={
            <Button
              className="bg-amber-600 hover:bg-amber-700"
              onClick={() => router.push(`/${locale}/staff/settlement`)}
            >
              {t('go_to_settlement') || 'Go to Settlement'}
            </Button>
          }
        />
      </PageContainer>
    );
  }

  const headers = [
    t('reference') || 'Reference',
    t('amount') || 'Amount',
    t('bookings') || 'Bookings',
    t('initiated_by') || 'Initiated By',
    t('date') || 'Date',
    t('status') || 'Status',
    t('actions') || 'Actions',
  ];

  const rows = transfers.map((transfer) => [
    <span key="ref" className="font-mono text-sm font-medium text-stone-600">
      {transfer.referenceNumber}
    </span>,
    <div key="amount" className="font-bold text-amber-600">
      ETB {transfer.amountEtb}
    </div>,
    <div key="bookings">{transfer.bookingIds.length}</div>,
    <div key="initiator">{transfer.initiatedByName}</div>,
    <div key="date" className="text-sm text-stone-500">
      {formatDateTime(transfer.createdAt)}
    </div>,
    <div key="status">
      <StatusBadge status={transfer.status === 'completed' ? 'visited' : 'pending'} />
    </div>,
    <div key="actions">
      <Button
        size="sm"
        variant="secondary"
        onClick={() => router.push(`/${locale}/staff/settlement/transfers/${transfer.id}`)}
      >
        {t('view') || 'View'}
      </Button>
    </div>,
  ]);

  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-stone-900">
            {t('settlement_history') || 'Settlement History'}
          </h1>
          <p className="text-stone-500 mt-1">
            {t('settlement_history_description') || 'View all past settlement transfers'}
          </p>
        </div>
        <Button
          className="bg-amber-600 hover:bg-amber-700"
          onClick={() => router.push(`/${locale}/staff/settlement`)}
        >
          🏦 {t('new_transfer') || 'New Transfer'}
        </Button>
      </div>

      <Card padding={false}>
        <Table headers={headers} rows={rows} />
      </Card>
    </PageContainer>
  );
}
