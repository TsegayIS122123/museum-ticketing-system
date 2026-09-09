'use client';

import { useEffect, useState } from 'react';
import { Download, Calendar, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import { Table } from '@/components/ui/Table';
import {
  getDashboard,
  getReportSummary,
  getCashierBalances,
  getBookingTimeline,
  type DashboardResponse,
  type ReportSummaryResponse,
  type ReportPeriod,
  type CashierBalancesResponse,
  type BookingTimelineResponse,
} from '@/features/reports/api';
import { downloadCsv } from '@/lib/utils/download';

// A day is flagged "busy" once its expected headcount (Pending + Visited
// -- see backend/apps/reporting/services.py's get_booking_timeline) hits
// this many visitors. There's no capacity field anywhere in the backend
// (Document 05 confirms `DateAvailability` only ever tracked an
// open/closed boolean, never a number), so this is a fixed, roughly
// "small museum tour group" threshold rather than a per-museum setting --
// good enough to draw a Manager's eye to a date worth a closer look, not
// meant as an authoritative capacity limit.
const BUSY_HEADCOUNT_THRESHOLD = 40;

export default function ReportsPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const [period, setPeriod] = useState<ReportPeriod>('daily');
  const [summary, setSummary] = useState<ReportSummaryResponse | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Cashier balances and the booking timeline don't depend on `period`
  // (the first is a point-in-time balance, the second is its own
  // from/to range defaulting to the next two weeks) -- fetched once,
  // separately, so switching the period pills above doesn't re-fetch
  // either of them for no reason.
  const [cashierBalances, setCashierBalances] = useState<CashierBalancesResponse | null>(null);
  const [timeline, setTimeline] = useState<BookingTimelineResponse | null>(null);
  const [isLoadingExtra, setIsLoadingExtra] = useState(true);
  const [extraError, setExtraError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [summaryRes, dashboardRes] = await Promise.all([getReportSummary(period), getDashboard()]);
        if (cancelled) return;
        setSummary(summaryRes);
        setDashboard(dashboardRes);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Failed to load reports');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [period]);

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

  const revenueByCategory = summary
    ? Object.entries(summary.revenueByCategory).map(([name, amount]) => ({
        name,
        amount: parseFloat(amount),
      }))
    : [];
  const revenueTotal = revenueByCategory.reduce((sum, c) => sum + c.amount, 0);

  const totalVisitors = summary
    ? Object.values(summary.visitorCountsByGroup).reduce((sum, n) => sum + n, 0)
    : 0;

  const periodOptions: { value: ReportPeriod; label: string }[] = [
    { value: 'daily', label: t('daily') || 'Daily' },
    { value: 'weekly', label: t('weekly') || 'Weekly' },
    { value: 'monthly', label: t('monthly') || 'Monthly' },
    { value: 'yearly', label: t('yearly') || 'Yearly' },
  ];

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

  const handleExportCsv = () => {
    if (!summary) return;
    const rows: (string | number)[][] = [
      ['Total visitors', totalVisitors],
      ['Total revenue (period)', revenueTotal],
      ['Total revenue (overall)', dashboard?.revenueTotalEtb ?? 0],
      ['Cancelled, refund pending (overall)', dashboard?.statusMix.cancelled ?? 0],
      ['Cancelled and refunded (overall)', dashboard?.statusMix.refunded ?? 0],
      [],
      ['Revenue by category', ''],
      ...revenueByCategory.map((cat) => [cat.name, cat.amount]),
    ];
    downloadCsv(`report-${period}-${summary.from}-to-${summary.to}.csv`, ['Metric', 'Value'], rows);
  };

  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif font-semibold text-2xl text-stone-900">
            {t('reports') || 'Reports'}
          </h1>
          <p className="text-stone-500 mt-1">
            {t('reports_description') || 'Sales and visitor analytics'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {periodOptions.map((p) => (
            <button
              key={p.value}
              onClick={() => setPeriod(p.value)}
              className={`px-4 py-2 rounded-lg text-sm font-medium border-2 transition-all cursor-pointer ${
                period === p.value
                  ? 'bg-brand-primary text-white border-brand-primary'
                  : 'border-stone-200 text-stone-700 hover:border-slate-400'
              }`}
            >
              {p.label}
            </button>
          ))}
          <Button variant="secondary" size="sm" onClick={handleExportCsv} disabled={!summary}>
            <Download className="w-4 h-4" /> {t('export') || 'Export'}
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="p-8 text-center text-stone-500">{t('loading') || 'Loading...'}</div>
      ) : error ? (
        <div className="p-8 text-center text-red-600">{error}</div>
      ) : (
        <>
          <p className="text-xs text-stone-400 mb-3">
            {t('reports_stats_note') ||
              "Total Visitors counts everyone booked for this period, arrived or not. Total Revenue only counts checked-in visitors."}
          </p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8">
            <StatCard
              label={t('total_visitors') || 'Total Visitors'}
              value={totalVisitors}
              sub={`${summary?.bookingCount ?? 0} ${t('bookings_in_period') || 'bookings in this period'}`}
              color="green"
            />
            <StatCard
              label={t('total_revenue') || 'Total Revenue'}
              value={`ETB ${revenueTotal}`}
              sub={`${summary?.from ?? ''} - ${summary?.to ?? ''}`}
              color="primary"
            />
            <StatCard
              label={t('total_revenue_overall') || 'Total Revenue (overall)'}
              value={`ETB ${dashboard?.revenueTotalEtb ?? 0}`}
              sub={t('all_time') || 'All time'}
              color="blue"
            />
            <StatCard
              label={t('cancellations_all_time') || 'Cancelled, refund pending (All Time)'}
              value={dashboard?.statusMix.cancelled ?? 0}
              sub={t('cancellations_sub')}
              color="red"
            />
            <StatCard
              label={t('refunded_all_time') || 'Refunded (All Time)'}
              value={dashboard?.statusMix.refunded ?? 0}
              sub={t('refunded_sub')}
              color="secondary"
            />
          </div>

          <Card>
            <div className="font-semibold text-stone-900 mb-5">
              {t('revenue_by_category') || 'Revenue by Category'}
            </div>
            <div className="space-y-3">
              {revenueByCategory.map((cat) => (
                <div key={cat.name} className="flex items-center gap-3 text-sm">
                  <div className="w-24 text-stone-600 flex-shrink-0">{cat.name}</div>
                  <div className="flex-1 bg-stone-100 rounded-full h-3 overflow-hidden">
                    <div
                      className="h-full bg-slate-800 rounded-full"
                      style={{ width: revenueTotal ? `${(cat.amount / revenueTotal) * 100}%` : '0%' }}
                    />
                  </div>
                  <div className="w-20 text-right text-stone-500 flex-shrink-0">
                    ETB {cat.amount}
                  </div>
                </div>
              ))}
              {revenueByCategory.length === 0 && (
                <div className="text-sm text-stone-400">
                  {t('no_data') || 'No revenue data for this period'}
                </div>
              )}
            </div>
          </Card>

          {/*
            The mock version of this page also showed a "Sales Channel Breakdown"
            (online/e-wallet/counter split). There's no endpoint for that split --
            every payment goes through the same Chapa gateway regardless of who
            initiates it (backend/apps/payments/models.py), so there's no channel
            to report on. The day-by-day "Booking Summary" table the mock also
            showed IS now backed by GET /reports/booking-timeline -- see below.
          */}

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
        </>
      )}
    </PageContainer>
  );
}
