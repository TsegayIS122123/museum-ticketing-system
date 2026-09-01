'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { PageContainer } from '@/components/layout/PageContainer';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { ApprovalDecisionPanel } from '@/features/group-bookings/components/ApprovalDecisionPanel';
import { getGroupBooking, type Booking } from '@/features/group-bookings/api';

export default function GroupBookingDetailPage() {
  const { t, locale } = useTranslation();
  const params = useParams();
  const router = useRouter();

  const [request, setRequest] = useState<Booking | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const bookingId = params.id as string;

  const loadRequest = async () => {
    setIsLoading(true);
    try {
      const data = await getGroupBooking(bookingId);
      setRequest(data);
    } catch (error: any) {
      setToast({
        message: error.message || t('failed_to_load') || 'Failed to load group booking.',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (bookingId) {
      loadRequest();
    }
  }, [bookingId]);

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

  if (!request) {
    return (
      <PageContainer>
        <div className="text-center py-12">
          <div className="text-4xl mb-4">🔍</div>
          <h2 className="font-serif text-2xl text-stone-900">
            {t('request_not_found') || 'Request Not Found'}
          </h2>
          <Button
            className="mt-4"
            onClick={() => router.push(`/${locale}/staff/group-bookings`)}
          >
            {t('back_to_list') || 'Back to List'}
          </Button>
        </div>
      </PageContainer>
    );
  }

  return (
    <PageContainer maxWidth="lg">
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <Button
        variant="ghost"
        size="sm"
        className="mb-4"
        onClick={() => router.push(`/${locale}/staff/group-bookings`)}
      >
        ← {t('back_to_list') || 'Back to List'}
      </Button>

      <ApprovalDecisionPanel
        request={request}
        onDecisionComplete={() => {
          setToast({
            message: t('decision_processed') || 'Decision processed successfully.',
            type: 'success',
          });
          loadRequest();
        }}
      />
    </PageContainer>
  );
}
