'use client';

import { useEffect, useState } from 'react';
import { Download } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import {
  getDashboard,
  getReportSummary,
  type DashboardResponse,
  type ReportSummaryResponse,
  type ReportPeriod,
} from '@/features/reports/api';
import { downloadCsv } from '@/lib/utils/download';

export default function ReportsPage() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<ReportPeriod>('daily');
  const [summary, setSummary] = useState<ReportSummaryResponse | null>(null);
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

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
            (online/e-wallet/counter split) and a day-by-day "Booking Summary"
            table. Neither is backed by an endpoint in contracts/openapi.yaml --
            /reports/summary and /reports/dashboard only return aggregate totals,
            not a per-day or per-channel breakdown. Add those sections back once
            the backend exposes that data.
          */}
        </>
      )}
    </PageContainer>
  );
}
