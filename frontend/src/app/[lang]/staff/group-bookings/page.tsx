'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { ApprovalQueueTable } from '@/features/group-bookings/components/ApprovalQueueTable';
import { getGroupBookings, type Booking } from '@/features/group-bookings/api';

export default function GroupBookingsPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();

  const [requests, setRequests] = useState<Booking[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadRequests = async () => {
    setIsLoading(true);
    try {
      const response = await getGroupBookings();
      const nextRequests = Array.isArray(response?.data) ? response.data : [];
      setRequests(nextRequests);
    } catch (error: any) {
      setToast({
        message: error.message || t('failed_to_load') || 'Failed to load group bookings.',
        type: 'error',
      });
      setRequests([]);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const safeRequests = Array.isArray(requests) ? requests : [];

  // Real backend model: pending review = approvalStatus still null.
  const pendingCount = safeRequests.filter(r => r.approvalStatus === null).length;
  const approvedCount = safeRequests.filter(r => r.approvalStatus === 'approved').length;
  const declinedCount = safeRequests.filter(r => r.approvalStatus === 'declined').length;

  const handleReview = (id: string) => {
    router.push(`/${locale}/staff/group-bookings/${id}`);
  };

  return (
    <PageContainer>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-stone-900">
            {t('group_bookings') || 'Group Bookings'}
          </h1>
          <p className="text-stone-500 mt-1">
            {t('group_bookings_description') || 'Review and manage group and school visit requests'}
          </p>
        </div>
        <Button
          variant="secondary"
          onClick={loadRequests}
          disabled={isLoading}
        >
          🔄 {t('refresh') || 'Refresh'}
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4 mb-8">
        <StatCard
          label={t('pending') || 'Pending'}
          value={pendingCount}
          color="secondary"
        />
        <StatCard
          label={t('approved') || 'Approved'}
          value={approvedCount}
          color="green"
        />
        <StatCard
          label={t('declined') || 'Declined'}
          value={declinedCount}
          color="red"
        />
      </div>

      <ApprovalQueueTable
        requests={safeRequests}
        isLoading={isLoading}
        onReview={handleReview}
        onRefresh={loadRequests}
      />
    </PageContainer>
  );
}
