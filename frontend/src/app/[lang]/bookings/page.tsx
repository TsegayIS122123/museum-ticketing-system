'use client';

import { useEffect, useState } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { PublicHeader } from '@/components/layout/PublicHeader';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { BookingList } from '@/features/booking/components/BookingList';
import { getMyBookings } from '@/features/booking/api';
import { Toast } from '@/components/ui/Toast';
import { useRouter } from 'next/navigation';

export default function MyBookingsPage() {
  const { t, locale } = useTranslation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [bookings, setBookings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const loadBookings = async () => {
    setIsLoading(true);
    try {
      const response = await getMyBookings();
      setBookings(response.data);
    } catch (error: any) {
      setToast({
        message: error.message || 'Failed to load bookings',
        type: 'error',
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    if (authLoading) return;

    if (!isAuthenticated) {
      router.push(`/${locale}/verify`);
      return;
    }

    loadBookings();
  }, [isAuthenticated, authLoading, locale, router]);

  if (authLoading) {
    return (
      <div className="min-h-screen flex flex-col" data-surface="visitor">
        <PublicHeader />
        <main className="flex-1 flex items-center justify-center">
          <div className="text-stone-500">{t('loading')}</div>
        </main>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null; // Will redirect
  }

  const totalBookings = bookings.length;
  const upcomingBookings = bookings.filter(b => b.status === 'pending').length;
  const completedBookings = bookings.filter(b => b.status === 'visited').length;
  const cancelledBookings = bookings.filter(b => b.status === 'cancelled').length;

  return (
    <div className="min-h-screen flex flex-col" data-surface="visitor">
      <PublicHeader />
      <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="mb-8">
          <h1 className="text-3xl font-serif font-bold text-stone-900">
            {t('my_bookings') || 'My Bookings'}
          </h1>
          <p className="text-stone-500 mt-1">
            {t('my_bookings_description') || 'Manage your museum visit bookings'}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            label={t('total') || 'Total'}
            value={totalBookings}
          />
          <StatCard
            label={t('upcoming') || 'Upcoming'}
            value={upcomingBookings}
            color="amber"
          />
          <StatCard
            label={t('completed') || 'Completed'}
            value={completedBookings}
            color="green"
          />
          <StatCard
            label={t('cancelled') || 'Cancelled'}
            value={cancelledBookings}
            color="red"
          />
        </div>

        {/* Bookings List */}
        <BookingList
          bookings={bookings}
          isLoading={isLoading}
          onRefresh={loadBookings}
        />
      </main>

      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}
    </div>
  );
}
