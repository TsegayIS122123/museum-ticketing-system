'use client';

import { useEffect, useState } from 'react';
import { Tag, Calendar, BarChart3, DoorOpen, Landmark } from 'lucide-react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Button } from '@/components/ui/Button';
import { PageContainer } from '@/components/layout/PageContainer';
import { useRouter } from 'next/navigation';
import { getDashboard, getReportSummary, type DashboardResponse } from '@/features/reports/api';
import type { ReportSummary } from '@/lib/api-contract';

export default function StaffDashboardPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();

  const isManager = user?.role === 'museum_manager';
  const isAdmin = user?.role === 'platform_admin';

  // GET /reports/dashboard and /reports/summary are Museum Manager /
  // Platform Admin only (backend/apps/reporting/views.py) -- the same
  // endpoints ReportsPage already uses. Cashier never has a "Dashboard"
  // sidebar link (StaffSidebar's navByRole), so this only ever runs for
  // a role the backend will actually authorize.
  const [dashboard, setDashboard] = useState<DashboardResponse | null>(null);
  const [todaySummary, setTodaySummary] = useState<ReportSummary | null>(null);
  const [isLoading, setIsLoading] = useState(isManager || isAdmin);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isManager && !isAdmin) return;
    let cancelled = false;

    void (async () => {
      setIsLoading(true);
      setError(null);

      try {
        const [dashboardRes, summaryRes] = await Promise.all([
          getDashboard(),
          getReportSummary('daily'),
        ]);
        if (cancelled) return;
        setDashboard(dashboardRes);
        setTodaySummary(summaryRes);
      } catch (err: any) {
        if (!cancelled) setError(err.message || t('failed_to_load_dashboard') || 'Failed to load dashboard data');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
    // `t` intentionally excluded: useTranslation() returns a new function
    // reference every render, so including it here would refire this
    // fetch on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isManager, isAdmin]);

  const revenueToday = todaySummary
    ? Object.values(todaySummary.revenueByCategory).reduce(
        (sum, amount) => sum + parseFloat(amount),
        0
      )
    : 0;
  const transactionsToday = todaySummary
    ? Object.values(todaySummary.visitorCountsByGroup).reduce((sum, n) => sum + n, 0)
    : 0;
  const visitorsToday = transactionsToday;

  const statusMix = dashboard?.statusMix;
  const totalBookings = statusMix
    ? statusMix.pending + statusMix.visited + statusMix.cancelled + statusMix.refunded
    : 0;
  const checkedIn = statusMix?.visited ?? 0;
  const checkedInPct = totalBookings > 0 ? Math.round((checkedIn / totalBookings) * 100) : 0;

  return (
    <PageContainer>
      <div className="mb-8">
        <div className="text-xs text-stone-400 uppercase tracking-wider mb-1">
          {t('welcome_back') || 'Welcome back'}
        </div>
        <h1 className="font-serif font-semibold text-4xl text-stone-900">
          {user?.full_name || t('staff') || 'Staff'}
        </h1>
        <p className="text-stone-500 mt-1">
          {new Date().toLocaleDateString('en-US', {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric',
          })}
        </p>
      </div>

      {(isManager || isAdmin) && (
        <>
          {isLoading ? (
            <div className="mb-8 text-stone-500">{t('loading') || 'Loading...'}</div>
          ) : error ? (
            <div className="mb-8 text-red-600">{error}</div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
              <StatCard
                label={t('todays_revenue') || "Today's Revenue"}
                value={`ETB ${revenueToday}`}
                sub={`${transactionsToday} ${t('bookings_today') || 'bookings today'}`}
                color="green"
              />
              <StatCard
                label={t('visitors_today') || 'Visitors Today'}
                value={visitorsToday}
                sub={t('booked_quantity_today') || 'Booked quantity today'}
                color="primary"
              />
              <StatCard
                label={t('checked_in') || 'Checked In'}
                value={checkedIn}
                sub={
                  totalBookings > 0
                    ? `${checkedInPct}% ${t('of_all_bookings') || 'of all bookings'}`
                    : t('no_bookings_yet') || 'No bookings yet'
                }
                color="blue"
              />
            </div>
          )}
        </>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <h3 className="text-lg font-semibold text-stone-900 mb-4">{t('quick_actions') || 'Quick Actions'}</h3>
          <div className="space-y-3">
            {isManager ? (
              <>
                <Button
                  className="w-full justify-start"
                  variant="secondary"
                  onClick={() => router.push(`/${locale}/staff/categories`)}
                >
                  <Tag className="w-4 h-4" /> {t('manage_categories') || 'Manage Categories'}
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="secondary"
                  onClick={() => router.push(`/${locale}/staff/availability`)}
                >
                  <Calendar className="w-4 h-4" /> {t('manage_availability') || 'Manage Availability'}
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="secondary"
                  onClick={() => router.push(`/${locale}/staff/reports`)}
                >
                  <BarChart3 className="w-4 h-4" /> {t('view_reports') || 'View Reports'}
                </Button>
              </>
            ) : (
              <>
                <Button
                  className="w-full justify-start bg-brand-primary hover:bg-primary-700"
                  onClick={() => router.push(`/${locale}/staff/gate`)}
                >
                  <DoorOpen className="w-4 h-4" /> {t('gate_check_in') || 'Gate Check-in'}
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="secondary"
                  onClick={() => router.push(`/${locale}/staff/settlement`)}
                >
                  <Landmark className="w-4 h-4" /> {t('settlement') || 'Settlement'}
                </Button>
              </>
            )}
          </div>
        </Card>

        {(isManager || isAdmin) && !isLoading && !error && statusMix && (
          <Card>
            <h3 className="text-lg font-semibold text-stone-900 mb-4">{t('booking_status_all_time') || 'Booking Status (All Time)'}</h3>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between py-2 border-b border-stone-100">
                <span className="text-stone-500">{t('pending')}</span>
                <span className="font-medium">{statusMix.pending}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-stone-100">
                <span className="text-stone-500">{t('visited')}</span>
                <span className="font-medium">{statusMix.visited}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-stone-100">
                <span className="text-stone-500">{t('cancelled')}</span>
                <span className="font-medium text-red-500">{statusMix.cancelled}</span>
              </div>
              <div className="flex justify-between py-2 font-bold text-lg">
                <span>{t('total_revenue') || 'Total Revenue'}</span>
                <span className="text-primary-600">ETB {dashboard?.revenueTotalEtb ?? 0}</span>
              </div>
            </div>
          </Card>
        )}
      </div>
      {/*
        The mock version of this page also showed a per-channel (Online/
        Counter) sales breakdown with a computed "Net Revenue" line. Same
        as ReportsPage: /reports/dashboard and /reports/summary don't
        expose a sales-channel split, so it isn't reproduced here --
        only real, backend-sourced numbers are shown above.
      */}
    </PageContainer>
  );
}
