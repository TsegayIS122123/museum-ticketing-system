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
import { CalendarClock, CheckCircle2, Ticket, Undo2 } from 'lucide-react';

export default function MyBookingsPage() {
  const { t, locale } = useTranslation();
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [bookings, setBookings] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  // Which of the four report cards is currently filtering the list below
  // -- 'all' means the Total card is selected (or nothing's been clicked
  // yet), the other three map onto the same booking statuses each card
  // already counts.
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'visited' | 'cancelled'>(
    'all'
  );

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

    void (async () => {
      await loadBookings();
    })();
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

  // A cancellation (FR-BOOK-006) always carries an automatic refund, and
  // the backend moves the booking's status straight from `cancelled` to
  // `refunded` as soon as that refund completes -- by the time this page
  // loads, a visitor's cancelled booking has almost always already
  // finished that transition. Treating `cancelled` and `refunded` as one
  // bucket here keeps the "Cancelled" card (and its filter) from
  // undercounting -- otherwise it reads 0 even right after a visitor
  // cancels something.
  const isCancelledOrRefunded = (status: string) => status === 'cancelled' || status === 'refunded';

  const totalBookings = bookings.length;
  const upcomingBookings = bookings.filter(b => b.status === 'pending').length;
  const completedBookings = bookings.filter(b => b.status === 'visited').length;
  const cancelledBookings = bookings.filter(b => isCancelledOrRefunded(b.status)).length;

  const visibleBookings =
    statusFilter === 'all'
      ? bookings
      : statusFilter === 'cancelled'
        ? bookings.filter((b) => isCancelledOrRefunded(b.status))
        : bookings.filter((b) => b.status === statusFilter);

  // Clicking the card that's already selected clears the filter back to
  // Total, rather than leaving no way to get back to the full list short
  // of a refresh.
  const toggleFilter = (next: 'all' | 'pending' | 'visited' | 'cancelled') => {
    setStatusFilter((current) => (current === next ? 'all' : next));
  };

  return (
    <div className="min-h-screen flex flex-col" data-surface="visitor">
      <PublicHeader />
      <div className="flex flex-col flex-1">
        <main className="flex-1 max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 w-full">
        <div className="mb-8">
          <h1 className="text-3xl font-extrabold text-stone-900">
            {t('my_bookings') || 'My Bookings'}
          </h1>
          <p className="text-stone-700 mt-1">
            {t('my_bookings_description') || 'Manage your museum visit bookings'}
          </p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          <StatCard
            label={t('total') || 'Total'}
            accent="sky"
            icon={<Ticket className="h-5 w-5" />}
            value={totalBookings}
            onClick={() => toggleFilter('all')}
            selected={statusFilter === 'all'}
          />
          <StatCard
            label={t('upcoming') || 'Upcoming'}
            accent="sun"
            icon={<CalendarClock className="h-5 w-5" />}
            value={upcomingBookings}
            color="primary"
            onClick={() => toggleFilter('pending')}
            selected={statusFilter === 'pending'}
          />
          <StatCard
            label={t('completed') || 'Completed'}
            accent="leaf"
            icon={<CheckCircle2 className="h-5 w-5" />}
            value={completedBookings}
            color="green"
            onClick={() => toggleFilter('visited')}
            selected={statusFilter === 'visited'}
          />
          <StatCard
            label={t('refunded') || 'Refunded'}
            accent="coral"
            icon={<Undo2 className="h-5 w-5" />}
            value={cancelledBookings}
            color="red"
            onClick={() => toggleFilter('cancelled')}
            selected={statusFilter === 'cancelled'}
          />
        </div>

        {/* Bookings List -- filtered to whichever card above is selected */}
        <BookingList
          bookings={visibleBookings}
          isLoading={isLoading}
          onRefresh={loadBookings}
        />
        </main>
      </div>

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
