'use client';

/**
 * Pre-7c "operations" sections of the Reports page, moved here unchanged
 * in behaviour: the Cashier outstanding-balance cross-check and the
 * forward-looking booking timeline. They are point-in-time views (not
 * scoped to the page's date range), so they sit under the Overview as
 * "Today's operations" instead of being driven by the range control.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Calendar } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Table } from '@/components/ui/Table';
import {
  getCashierBalances,
  getBookingTimeline,
  type CashierBalancesResponse,
  type BookingTimelineResponse,
} from '../api';

// A day is flagged "busy" once its expected headcount (Pending + Visited
// -- see backend/apps/reporting/services.py's get_booking_timeline) hits
// this many visitors. There's no capacity field anywhere in the backend
// (Document 05 confirms `DateAvailability` only ever tracked an
// open/closed boolean, never a number), so this is a fixed, roughly
// "small museum tour group" threshold rather than a per-museum setting --
// good enough to draw a Manager's eye to a date worth a closer look, not
// meant as an authoritative capacity limit.
const BUSY_HEADCOUNT_THRESHOLD = 40;

export function OperationsPanel() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [cashierBalances, setCashierBalances] = useState<CashierBalancesResponse | null>(null);
  const [timeline, setTimeline] = useState<BookingTimelineResponse | null>(null);
  const [isLoadingExtra, setIsLoadingExtra] = useState(true);
  const [extraError, setExtraError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setIsLoadingExtra(true);
      setExtraError(null);

      try {
        const [balancesRes, timelineRes] = await Promise.all([getCashierBalances(), getBookingTimeline()]);
        if (cancelled) return;
        setCashierBalances(balancesRes);
        setTimeline(timelineRes);
      } catch (err: any) {
        if (!cancelled) setExtraError(err.message || 'Failed to load cashier/timeline data');
      } finally {
        if (!cancelled) setIsLoadingExtra(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  // Cross-check for the cashier-balances card: outstanding (still sitting
  // uncollected in Chapa's pooled balance) + reconciled (already
  // transferred to the bank) should equal total revenue -- both are
  // computed independently on the backend (see
  // backend/apps/reporting/services.py's get_cashier_balances docstring),
  // so this comparison is a real integrity check, not something that
  // trivially always passes. A fixed cent of rounding slack absorbs
  // Decimal string formatting differences, not a real discrepancy.
  const outstandingTotal = cashierBalances ? parseFloat(cashierBalances.totalOutstandingEtb) : 0;
  const reconciledTotal = cashierBalances ? parseFloat(cashierBalances.totalReconciledEtb) : 0;
  const revenueTotalForCheck = cashierBalances ? parseFloat(cashierBalances.totalRevenueEtb) : 0;
  const balancesReconcile =
    !!cashierBalances && Math.abs(outstandingTotal + reconciledTotal - revenueTotalForCheck) < 0.01;

  const formatDayLabel = (dateStr: string) =>
    new Date(`${dateStr}T00:00:00`).toLocaleDateString(locale === 'en' ? 'en-US' : 'am-ET', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
    });

  const timelineMaxHeadcount = timeline
    ? Math.max(
        1,
        ...timeline.days.map((day) => day.awaitingPaymentHeadcount + day.pendingHeadcount + day.visitedHeadcount)
      )
    : 1;

  return (
    <div className="space-y-0">
      <h2 className="mt-2 font-serif text-xl font-semibold text-stone-900">{t('rpt_operations_title')}</h2>
      <p className="text-xs text-stone-600">{t('rpt_operations_caption')}</p>
  {extraError ? (
    <Card className="mt-8">
      <div className="text-center text-red-600 py-4">{extraError}</div>
    </Card>
  ) : (
    <>
      <Card className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-5">
          <div className="font-semibold text-stone-900">
            {t('cashier_balances') || 'Cashier Outstanding Balances'}
          </div>
          {cashierBalances && (
            <div
              className={`inline-flex items-center gap-1.5 text-xs font-medium rounded-full px-2.5 py-1 border ${
                balancesReconcile
                  ? 'bg-green-100 text-green-800 border-green-200'
                  : 'bg-red-100 text-red-800 border-red-200'
              }`}
            >
              {balancesReconcile ? (
                <CheckCircle2 className="w-3.5 h-3.5" />
              ) : (
                <AlertTriangle className="w-3.5 h-3.5" />
              )}
              {balancesReconcile
                ? t('balances_reconcile') || 'Aligns with total revenue'
                : t('balances_mismatch') || "Doesn't align with total revenue"}
            </div>
          )}
        </div>

        {isLoadingExtra ? (
          <div className="py-8 text-center text-stone-500">{t('loading') || 'Loading...'}</div>
        ) : (
          <>
            <Table
              headers={[
                t('cashier') || 'Cashier',
                t('unreconciled_bookings') || 'Unreconciled Bookings',
                t('outstanding_balance') || 'Outstanding Balance',
              ]}
              numericColumns={[1, 2]}
              emptyMessage={t('no_cashiers') || 'No cashier accounts yet'}
              rows={
                cashierBalances?.cashiers.map((cashier) => [
                  cashier.cashierName,
                  cashier.unreconciledBookingCount,
                  `ETB ${cashier.outstandingBalanceEtb}`,
                ]) ?? []
              }
            />
            <div className="flex flex-wrap gap-6 mt-4 pt-4 border-t border-stone-100 text-sm">
              <div>
                <span className="text-stone-500">{t('total_outstanding') || 'Total outstanding'}: </span>
                <span className="font-medium text-stone-900">
                  ETB {cashierBalances?.totalOutstandingEtb ?? '0.00'}
                </span>
              </div>
              <div>
                <span className="text-stone-500">{t('total_reconciled') || 'Total reconciled'}: </span>
                <span className="font-medium text-stone-900">
                  ETB {cashierBalances?.totalReconciledEtb ?? '0.00'}
                </span>
              </div>
              <div>
                <span className="text-stone-500">{t('total_revenue_all_time') || 'Total revenue (all time)'}: </span>
                <span className="font-medium text-stone-900">
                  ETB {cashierBalances?.totalRevenueEtb ?? '0.00'}
                </span>
              </div>
            </div>
          </>
        )}
      </Card>

      <Card className="mt-8">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <div>
            <div className="font-semibold text-stone-900">
              {t('booking_timeline') || 'Booking Timeline'}
            </div>
            <p className="text-xs text-stone-400 mt-1">
              {t('booking_timeline_note') ||
                'Awaiting payment, pending, and visited bookings for the next two weeks. A crowded day is a candidate to close in Availability.'}
            </p>
          </div>
          <Button
            variant="secondary"
            size="sm"
            onClick={() => router.push(`/${locale}/staff/availability`)}
          >
            <Calendar className="w-4 h-4" /> {t('manage_availability') || 'Manage Availability'}
          </Button>
        </div>

        {isLoadingExtra ? (
          <div className="py-8 text-center text-stone-500">{t('loading') || 'Loading...'}</div>
        ) : (
          <>
            <div className="flex gap-3 overflow-x-auto pt-6 pb-2">
              {timeline?.days.map((day) => {
                const totalHeadcount =
                  day.awaitingPaymentHeadcount + day.pendingHeadcount + day.visitedHeadcount;
                const isBusy = day.expectedHeadcount >= BUSY_HEADCOUNT_THRESHOLD;
                const barHeight = (segment: number) =>
                  totalHeadcount === 0 ? 0 : (segment / timelineMaxHeadcount) * 100;
                return (
                  <div key={day.date} className="flex flex-col items-center flex-shrink-0 w-16">
                    <div className="text-xs text-stone-500 font-medium tabular-nums mb-1">
                      {totalHeadcount}
                    </div>
                    <div
                      className={`w-10 h-28 rounded-md flex flex-col justify-end overflow-hidden ${
                        day.isOpenForBooking ? 'bg-stone-100' : 'bg-stone-200'
                      }`}
                    >
                      <div
                        className="w-full bg-emerald-600"
                        style={{ height: `${barHeight(day.visitedHeadcount)}%` }}
                        title={`${t('visited') || 'Visited'}: ${day.visitedHeadcount}`}
                      />
                      <div
                        className="w-full bg-blue-500"
                        style={{ height: `${barHeight(day.pendingHeadcount)}%` }}
                        title={`${t('pending') || 'Pending'}: ${day.pendingHeadcount}`}
                      />
                      <div
                        className="w-full bg-amber-400"
                        style={{ height: `${barHeight(day.awaitingPaymentHeadcount)}%` }}
                        title={`${t('awaiting_payment') || 'Awaiting payment'}: ${day.awaitingPaymentHeadcount}`}
                      />
                    </div>
                    <div className="text-[11px] text-stone-500 mt-1.5 text-center leading-tight">
                      {formatDayLabel(day.date)}
                    </div>
                    {!day.isOpenForBooking ? (
                      <span className="mt-1 text-[10px] font-medium text-stone-500 bg-stone-100 rounded-full px-1.5 py-0.5">
                        {t('closed') || 'Closed'}
                      </span>
                    ) : isBusy ? (
                      <span className="mt-1 text-[10px] font-medium text-amber-800 bg-amber-100 rounded-full px-1.5 py-0.5">
                        {t('busy') || 'Busy'}
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </div>
            <div className="flex flex-wrap gap-4 mt-3 mb-6 text-xs text-stone-500">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400" /> {t('awaiting_payment') || 'Awaiting payment'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> {t('pending') || 'Pending'}
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600" /> {t('visited') || 'Visited'}
              </span>
            </div>

            <Table
              dense
              headers={[
                t('date') || 'Date',
                t('status') || 'Status',
                t('awaiting_payment') || 'Awaiting',
                t('pending') || 'Pending',
                t('visited') || 'Visited',
                t('cancelled') || 'Cancelled',
                t('refunded') || 'Refunded',
                t('expected_headcount') || 'Expected visitors',
              ]}
              numericColumns={[2, 3, 4, 5, 6, 7]}
              rows={
                timeline?.days.map((day) => [
                  formatDayLabel(day.date),
                  day.isOpenForBooking ? (
                    <span key="open" className="text-emerald-700 text-xs font-medium">
                      {t('open') || 'Open'}
                    </span>
                  ) : (
                    <span key="closed" className="text-stone-500 text-xs font-medium">
                      {t('closed') || 'Closed'}
                    </span>
                  ),
                  day.awaitingPaymentCount,
                  day.pendingCount,
                  day.visitedCount,
                  day.cancelledCount,
                  day.refundedCount,
                  day.expectedHeadcount,
                ]) ?? []
              }
            />
          </>
        )}
      </Card>
    </>
  )}
    </div>
  );
}
