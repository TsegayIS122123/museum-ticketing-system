'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getSettlementTransfer, type SettlementTransfer } from '@/features/settlement/api';

export default function TransferDetailPage() {
  const { t, locale } = useTranslation();
  const params = useParams();
  const router = useRouter();

  const [transfer, setTransfer] = useState<SettlementTransfer | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const transferId = params.id as string;

  useEffect(() => {
    const loadTransfer = async () => {
      setIsLoading(true);
      try {
        const data = await getSettlementTransfer(transferId);
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

  const formatDateTime = (dateStr: string) => {
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
            {t('transfer_not_found_description') || 'The requested settlement transfer does not exist.'}
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
            {t('transfer_details') || 'Transfer Details'}
          </h1>
          <p className="font-mono text-sm text-stone-400 mt-1">
            {transfer.referenceNumber}
          </p>
        </div>
        <StatusBadge status={transfer.status === 'completed' ? 'visited' : 'pending'} />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <h3 className="font-semibold text-stone-900 mb-4">
            {t('transfer_summary') || 'Transfer Summary'}
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-stone-100">
              <span className="text-stone-500">{t('amount') || 'Amount'}</span>
              <span className="font-bold text-xl text-amber-600 font-serif">
                ETB {transfer.amountEtb}
              </span>
            </div>
            <div className="flex justify-between py-2 border-b border-stone-100">
              <span className="text-stone-500">{t('bookings_settled') || 'Bookings Settled'}</span>
              <span className="font-medium">{transfer.bookingIds.length}</span>
            </div>
            <div className="flex justify-between py-2 border-b border-stone-100">
              <span className="text-stone-500">{t('initiated_by') || 'Initiated By'}</span>
              <span className="font-medium">{transfer.initiatedByName}</span>
            </div>
            <div className="flex justify-between py-2">
              <span className="text-stone-500">{t('initiated_at') || 'Initiated At'}</span>
              <span className="font-medium">{formatDateTime(transfer.createdAt)}</span>
            </div>
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-stone-900 mb-4">
            {t('actions') || 'Actions'}
          </h3>
          <div className="space-y-3">
            {transfer.receiptUrl && (
              <Button
                className="w-full bg-amber-600 hover:bg-amber-700"
                onClick={() => window.open(transfer.receiptUrl, '_blank')}
              >
                📄 {t('download_transfer_receipt') || 'Download Transfer Receipt'}
              </Button>
            )}
            <Button
              variant="secondary"
              className="w-full"
              onClick={() => router.push(`/${locale}/staff/settlement`)}
            >
              🏦 {t('go_to_settlement') || 'Go to Settlement'}
            </Button>
          </div>

          <div className="mt-4 p-3 bg-stone-50 rounded-lg text-xs text-stone-500">
            <span className="font-semibold">📌 {t('finance_note') || 'Finance Office Note'}</span>
            <p className="mt-1">
              {t('finance_receipt_instruction') || 'This receipt should be carried physically to the Finance Office alongside the manual-track cash deposit slip.'}
            </p>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
