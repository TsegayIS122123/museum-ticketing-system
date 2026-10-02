'use client';

import { useEffect, useState } from 'react';
import { Check, X, Calendar } from 'lucide-react';
import { parseLocalIsoDate, toLocalIsoDate } from '@/lib/utils/dates';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Toast } from '@/components/ui/Toast';
import { ConfirmDialog } from '@/components/ui/ConfirmDialog';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { getAvailability, updateAvailability } from '@/features/availability/api';

// The API only tracks a boolean isOpenForBooking -- there is no "full"
// concept in the backend (capacity isn't calculated automatically), so
// the calendar only has two real states.
type AvailabilityStatus = 'available' | 'closed';

interface DateStatus {
  date: string;
  status: AvailabilityStatus;
  // Set only for the recurring weekly closure (UAT round 1) -- every
  // Sunday, always closed, and not something a Museum Manager can
  // override through this page. `undefined` for an ordinary date,
  // whether open or Manager-closed.
  isWeeklyClosure?: boolean;
}

// Build the current month's dates, defaulting to "available" for any
// date the backend hasn't returned a record for yet.
const buildMonthDates = (): string[] => {
  const dates: string[] = [];
  const today = new Date();
  const startMonth = today.getMonth();
  const startYear = today.getFullYear();
  const daysInMonth = new Date(startYear, startMonth + 1, 0).getDate();

  for (let day = 1; day <= daysInMonth; day++) {
    const date = new Date(startYear, startMonth, day);
    dates.push(toLocalIsoDate(date));
  }

  return dates;
};

export default function AvailabilityPage() {
  const { t, locale } = useTranslation();

  const [dates, setDates] = useState<DateStatus[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    date: string;
    status: AvailabilityStatus;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    const monthDates = buildMonthDates();
    const from = monthDates[0];
    const to = monthDates[monthDates.length - 1];

    getAvailability(from, to)
      .then((records) => {
        if (cancelled) return;
        const byDate = new Map(records.map((r) => [r.date, r.isOpenForBooking]));
        const weeklyClosed = new Set(
          records.filter((r) => r.closedReason === 'weekly_closure').map((r) => r.date)
        );
        const merged = buildMonthDates().map((date) => ({
          date,
          status: (byDate.get(date) ?? true ? 'available' : 'closed') as AvailabilityStatus,
          isWeeklyClosure: weeklyClosed.has(date),
        }));
        setDates(merged);
      })
      .catch(() => {
        if (!cancelled) {
          setToast({ message: t('failed_to_load_availability_management') || 'Failed to load availability.', type: 'error' });
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
    // `t` intentionally excluded: useTranslation() returns a new function
    // reference every render, so including it here would refire this
    // fetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleStatusChange = async (date: string, newStatus: AvailabilityStatus) => {
    try {
      await updateAvailability(date, newStatus === 'available');
      setDates((prev) =>
        prev.map((d) => (d.date === date ? { ...d, status: newStatus } : d))
      );
      setToast({
        message: `${newStatus === 'available' ? 'Opened' : 'Closed'} ${date} for booking.`,
        type: 'success',
      });
    } catch (err: any) {
      setToast({ message: err.message || 'Failed to update availability.', type: 'error' });
    }
    setSelectedDate(null);
  };

  const getStatusColor = (status: AvailabilityStatus) => {
    switch (status) {
      case 'available':
        return 'bg-emerald-100 text-emerald-800 border-emerald-200';
      case 'closed':
        return 'bg-stone-100 text-stone-500 border-stone-300';
    }
  };

  const getStatusLabel = (status: AvailabilityStatus) => {
    switch (status) {
      case 'available':
        return t('available') || 'Available';
      case 'closed':
        return t('closed') || 'Closed';
    }
  };

  const getStatusBadge = (status: AvailabilityStatus) => {
    switch (status) {
      case 'available':
        return <StatusBadge status="active" />;
      case 'closed':
        return <StatusBadge status="inactive" />;
    }
  };

  const formatDate = (dateStr: string) => {
    const date = parseLocalIsoDate(dateStr);
    return date.toLocaleDateString(locale === 'en' ? 'en-US' : 'am-ET', {
      weekday: 'short',
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  };

  const today = toLocalIsoDate(new Date());
  const currentMonth = new Date().toLocaleString(locale === 'en' ? 'en-US' : 'am-ET', {
    month: 'long',
    year: 'numeric',
  });

  return (
    <PageContainer>
      {toast && (
        <Toast
          message={toast.message}
          type={toast.type}
          onClose={() => setToast(null)}
        />
      )}

      <div className="mb-6">
        <h1 className="font-serif font-semibold text-2xl text-stone-900">
          {t('availability_management') || 'Availability Management'}
        </h1>
        <p className="text-stone-500 mt-1">
          {t('availability_description') || 'Open and close visiting dates for online booking'}
        </p>
        <p className="text-xs text-stone-500 mt-1">
          {t('availability_note') || 'The system does not calculate capacity automatically. Dates are open for booking by default.'}
        </p>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-stone-500">{t('loading') || 'Loading...'}</div>
      ) : (
      <div className="grid md:grid-cols-3 gap-6">
        {/* Calendar */}
        <div className="md:col-span-2">
          <Card>
            <div className="text-lg font-semibold text-stone-900 mb-4">{currentMonth}</div>
            <div className="grid grid-cols-7 gap-1 text-center mb-1">
              {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
                <div key={d} className="text-xs font-semibold text-stone-500 py-1">
                  {d}
                </div>
              ))}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {dates.map(({ date, status, isWeeklyClosure }) => {
                const isSelected = selectedDate === date;
                const isPast = date < today;
                const isLocked = isPast || isWeeklyClosure;
                const cellStyle = isPast
                  ? 'bg-stone-50 text-stone-500 cursor-not-allowed'
                  : isWeeklyClosure
                  ? 'bg-stone-200 text-stone-500 cursor-not-allowed'
                  : getStatusColor(status);

                return (
                  <button
                    key={date}
                    onClick={() => !isLocked && setSelectedDate(date)}
                    disabled={isLocked}
                    title={isWeeklyClosure ? t('closed_every_sunday') || 'The museum is closed every Sunday' : undefined}
                    className={`
                      text-sm py-2.5 rounded-lg font-medium border-2 transition-all cursor-pointer
                      ${cellStyle}
                      ${isSelected ? 'ring-2 ring-secondary-500 ring-offset-1' : ''}
                      ${isPast ? 'line-through' : ''}
                    `}
                  >
                    {parseLocalIsoDate(date).getDate()}
                  </button>
                );
              })}
            </div>

            <div className="flex gap-4 mt-4 pt-4 border-t border-stone-200 text-xs flex-wrap">
              {(['available', 'closed'] as AvailabilityStatus[]).map((status) => (
                <span
                  key={status}
                  className={`flex items-center gap-1.5 px-2 py-1 rounded-full border ${getStatusColor(status)}`}
                >
                  {getStatusLabel(status)}
                </span>
              ))}
              <span className="flex items-center gap-1.5 px-2 py-1 rounded-full border bg-stone-200 text-stone-500 border-stone-300">
                {t('closed_every_sunday') || 'Closed every Sunday'}
              </span>
            </div>
          </Card>
        </div>

        {/* Controls */}
        <div>
          {selectedDate ? (
            <Card>
              <div className="font-semibold text-stone-900 mb-1">
                {t('selected_date') || 'Selected Date'}
              </div>
              <div className="text-sm text-stone-500 mb-4">{formatDate(selectedDate)}</div>

              <div className="font-semibold text-stone-900 mb-3 text-sm">
                {t('current_status') || 'Current Status'}
              </div>
              <div className="mb-4">
                {getStatusBadge(dates.find((d) => d.date === selectedDate)?.status || 'available')}
              </div>

              <div className="space-y-2">
                <div className="text-xs font-semibold text-stone-500 uppercase tracking-wider mb-2">
                  {t('change_to') || 'Change to:'}
                </div>
                <Button
                  size="sm"
                  className="w-full bg-brand-primary hover:bg-primary-700"
                  onClick={() =>
                    setConfirmDialog({ open: true, date: selectedDate, status: 'available' })
                  }
                >
                  <Check className="w-4 h-4" /> {t('open_available') || 'Open / Available'}
                </Button>
                <Button
                  size="sm"
                  variant="danger"
                  className="w-full"
                  onClick={() =>
                    setConfirmDialog({ open: true, date: selectedDate, status: 'closed' })
                  }
                >
                  <X className="w-4 h-4" /> {t('close_date') || 'Close Date'}
                </Button>
              </div>
            </Card>
          ) : (
            <Card className="bg-stone-50 border-stone-200 text-center">
              <div className="mb-3 flex justify-center text-stone-500">
                <Calendar className="w-7 h-7" />
              </div>
              <div className="font-semibold text-stone-700">
                {t('select_a_date') || 'Select a date'}
              </div>
              <div className="text-xs text-stone-500 mt-1">
                {t('select_date_instruction') || 'Click any date on the calendar to manage its availability'}
              </div>
            </Card>
          )}
        </div>
      </div>
      )}

      <ConfirmDialog
        open={!!confirmDialog}
        onClose={() => setConfirmDialog(null)}
        onConfirm={() => {
          if (confirmDialog) {
            handleStatusChange(confirmDialog.date, confirmDialog.status);
            setConfirmDialog(null);
          }
        }}
        title={t('confirm_change') || 'Confirm Availability Change'}
        message={
          confirmDialog
            ? t('availability_change_confirmation', {
                date: formatDate(confirmDialog.date),
                status: getStatusLabel(confirmDialog.status),
              })
            : ''
        }
        confirmLabel={t('confirm') || 'Confirm'}
        danger={confirmDialog?.status === 'closed'}
      />
    </PageContainer>
  );
}