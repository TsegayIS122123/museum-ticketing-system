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
import { getGroupBookings, type GroupBookingRequest } from '@/features/group-bookings/api';

export default function GroupBookingsPage() {
  const { t } = useTranslation();
  const router = useRouter();

  const [requests, setRequests] = useState<GroupBookingRequest[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadRequests = async () => {
    setIsLoading(true);
    try {
      const data = await getGroupBookings();
      setRequests(data);
    } catch (error: any) {
      setToast({
        message: error.message || t('failed_to_load') || 'Failed to load group bookings.',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadRequests();
  }, []);

  const pendingCount = requests.filter(r => r.status === 'pending').length;
  const approvedCount = requests.filter(r => r.status === 'approved').length;
  const declinedCount = requests.filter(r => r.status === 'declined').length;

  const handleReview = (id: string) => {
    router.push(`/${router.locale}/staff/group-bookings/${id}`);
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
          color="amber"
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
        requests={requests}
        isLoading={isLoading}
        onReview={handleReview}
        onRefresh={loadRequests}
      />
    </PageContainer>
  );
}
