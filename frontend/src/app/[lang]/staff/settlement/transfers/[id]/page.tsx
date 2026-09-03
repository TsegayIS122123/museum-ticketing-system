'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getReconciliation, type CashierReconciliation } from '@/features/settlement/api';

export default function TransferDetailPage() {
  const { t, locale } = useTranslation();
  const params = useParams();
  const router = useRouter();

  const [transfer, setTransfer] = useState<CashierReconciliation | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const transferId = params.id as string;

  useEffect(() => {
    const loadTransfer = async () => {
      setIsLoading(true);
      try {
        // No single-retrieve endpoint exists -- getReconciliation pages
        // through the list client-side to find this id.
        const data = await getReconciliation(transferId);
        setTransfer(data);
      } catch (error) {
        console.error('Failed to load transfer:', error);
      } finally {
        setIsLoading(false);
      }
    };

    if (transferId) {
      loadTransfer();
    }
  }, [transferId]);

  const formatDateTime = (dateStr: string | null) => {
    if (!dateStr) return '—';
    const date = new Date(dateStr);
    return date.toLocaleString(locale === 'en' ? 'en-US' : 'am-ET', {
      year: 'numeric',
      month: 'long',
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
          <div className="h-64 bg-stone-200 rounded-xl" />
        </div>
      </PageContainer>
    );
  }

  if (!transfer) {
    return (
      <PageContainer>
        <Card className="text-center py-12">
          <div className="text-4xl mb-4">🔍</div>
          <h2 className="font-serif text-2xl text-stone-900">
            {t('transfer_not_found') || 'Transfer Not Found'}
          </h2>
          <p className="text-stone-500 mt-1">
            {t('transfer_not_found_description') || 'The requested settlement reconciliation does not exist.'}
          </p>
          <Button
            className="mt-4"
            onClick={() => router.push(`/${locale}/staff/settlement/transfers`)}
          >
            {t('back_to_history') || 'Back to History'}
          </Button>
        </Card>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="lg">
      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        onClick={() => router.push(`/${locale}/staff/settlement/transfers`)}
      >
        ← {t('back_to_history') || 'Back to History'}
      </Button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-stone-900">
            {t('transfer_details') || 'Reconciliation Details'}
          </h1>
          <p className="font-mono text-sm text-stone-400 mt-1">
            {transfer.chapaTransferReference || transfer.id}
          </p>
        </div>
        <StatusBadge status={transfer.status === 'completed' ? 'visited' : transfer.status === 'failed' ? 'cancelled' : 'pending'} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <h3 className="font-semibold text-stone-900 mb-4">
            {t('transfer_summary') || 'Reconciliation Summary'}
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-stone-100">
              <span className="text-stone-500">{t('amount') || 'Amount'}</span>
              <span className="font-bold text-xl text-primary-600 font-serif">
                ETB {transfer.amountEtb}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-stone-100">
              <span className="text-stone-500">{t('initiated_at') || 'Initiated At'}</span>
              <span className="font-medium">{formatDateTime(transfer.initiatedAt)}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-stone-500">{t('completed_at') || 'Completed At'}</span>
              <span className="font-medium">{formatDateTime(transfer.completedAt)}</span>
            </div>
            {transfer.status === 'failed' && transfer.failureReason && (
              <div className="flex justify-between py-2 border-t border-stone-100">
                <span className="text-stone-500">{t('failure_reason') || 'Failure Reason'}</span>
                <span className="font-medium text-red-600">{transfer.failureReason}</span>
              </div>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-stone-900 mb-4">
            {t('actions') || 'Actions'}
          </h3>
          <div className="space-y-3">
            {transfer.transferReceiptUrl && (
              <a href={transfer.transferReceiptUrl} target="_blank" rel="noreferrer">
                <Button className="w-full bg-brand-primary hover:bg-primary-700">
                  📄 {t('download_transfer_receipt') || 'Download Transfer Receipt'}
                </Button>
              </a>
            )}
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => router.push(`/${locale}/staff/settlement`)}
            >
              🏦 {t('go_to_settlement') || 'Go to Settlement'}
            </Button>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
