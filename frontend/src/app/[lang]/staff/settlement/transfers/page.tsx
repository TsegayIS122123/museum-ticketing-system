'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ScrollText, Landmark } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/Card';
import { Table } from '@/components/ui/Table';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { EmptyState } from '@/components/ui/EmptyState';
import { listReconciliations, type CashierReconciliation } from '@/features/settlement/api';

export default function SettlementTransfersPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();

  const [transfers, setTransfers] = useState<CashierReconciliation[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const loadTransfers = async () => {
    setIsLoading(true);
    try {
      const response = await listReconciliations();
      setTransfers(response.data);
    } catch (error) {
      console.error('Failed to load transfers:', error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void (async () => {
      await loadTransfers();
    })();
  }, []);

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '—';
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
          <h1 className="font-serif font-semibold text-2xl text-stone-900">
            {t('settlement_history') || 'Settlement History'}
          </h1>
          <p className="text-stone-500 mt-1">
            {t('settlement_history_description') || 'View all past settlement reconciliations'}
          </p>
        </div>
        <EmptyState
          icon={<ScrollText className="w-12 h-12" />}
          title={t('no_transfers') || 'No Reconciliations Yet'}
          description={t('no_transfers_description') || 'Settlement reconciliations will appear here once initiated.'}
          action={
            <Button
              className="bg-brand-primary hover:bg-primary-700"
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
    t('date') || 'Date',
    t('status') || 'Status',
    t('actions') || 'Actions',
  ];

  const rows = transfers.map((transfer) => [
    <span key="ref" className="font-mono text-sm font-medium text-stone-600">
      {transfer.chapaTransferReference || '—'}
    </span>,
    <div key="amount" className="font-bold text-primary-600">
      ETB {transfer.amountEtb}
    </div>,
    <div key="date" className="text-sm text-stone-500">
      {formatDateTime(transfer.initiatedAt || transfer.createdAt)}
    </div>,
    <div key="status">
      <StatusBadge status={transfer.status === 'completed' ? 'visited' : transfer.status === 'failed' ? 'cancelled' : 'pending'} />
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
          <h1 className="font-serif font-semibold text-2xl text-stone-900">
            {t('settlement_history') || 'Settlement History'}
          </h1>
          <p className="text-stone-500 mt-1">
            {t('settlement_history_description') || 'View all past settlement reconciliations'}
          </p>
        </div>
        <Button
          className="bg-brand-primary hover:bg-primary-700"
          onClick={() => router.push(`/${locale}/staff/settlement`)}
        >
          <Landmark className="w-4 h-4" /> {t('new_transfer') || 'New Reconciliation'}
        </Button>
      </div>

      <Card padding={false}>
        <Table headers={headers} rows={rows} dense numericColumns={[1]} />
      </Card>
    </PageContainer>
  );
}
