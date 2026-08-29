'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Button } from '@/components/ui/Button';
import { PageContainer } from '@/components/layout/PageContainer';
import { getPendingGroupBookingsCount } from '@/features/group-bookings/api';

export default function StaffDashboardPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);
  const [pendingRequests, setPendingRequests] = useState(0);

  // Mock data - in production, fetch from API
  const [stats, setStats] = useState({
    totalRevenue: 3290,
    visitorsToday: 124,
    checkIns: 98,
  });

  useEffect(() => {
    const loadData = async () => {
      try {
        const result = await getPendingGroupBookingsCount();
        setPendingRequests(result.count);
      } catch (error) {
        console.error('Failed to load pending requests:', error);
      } finally {
        setIsLoading(false);
      }
    };

    // Simulate loading
    const timer = setTimeout(() => {
      loadData();
    }, 500);

    return () => clearTimeout(timer);
  }, []);

  if (isLoading) {
    return (
      <PageContainer>
        <div className="animate-pulse space-y-4">
          <div className="h-8 bg-stone-200 rounded w-48" />
          <div className="grid grid-cols-4 gap-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="h-24 bg-stone-200 rounded-xl" />
            ))}
          </div>
        </div>
      </PageContainer>
    );
  }

  const isManager = user?.role === 'museum_manager';

  return (
    <PageContainer>
      <div className="mb-8">
        <div className="text-xs text-stone-400 uppercase tracking-wider mb-1">
          {t('welcome_back') || 'Welcome back'}
        </div>
        <h1 className="font-serif text-4xl text-stone-900">
          {user?.fullName || 'Staff'}
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

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label={t('today_revenue') || "Today's Revenue"}
          value={`ETB ${stats.totalRevenue}`}
          sub="32 transactions"
          color="green"
        />
        <StatCard
          label={t('visitors_today') || 'Visitors Today'}
          value={stats.visitorsToday}
          sub="Total check-ins"
          color="amber"
        />
        <StatCard
          label={t('check_ins') || 'Check-ins'}
          value={stats.checkIns}
          sub="79% of expected"
          color="blue"
        />
        <StatCard
          label={t('pending_requests') || 'Pending Requests'}
          value={pendingRequests}
          sub={t('group_bookings') || 'Group bookings'}
          color="red"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <h3 className="font-semibold text-stone-900 mb-4">
            {t('quick_actions') || 'Quick Actions'}
          </h3>
          <div className="space-y-3">
            {isManager && (
              <>
                <Button
                  className="w-full justify-start"
                  variant="secondary"
                  onClick={() => router.push(`/${locale}/staff/group-bookings`)}
                >
                  👥 {t('manage_group_bookings') || 'Manage Group Bookings'}
                  {pendingRequests > 0 && (
                    <span className="ml-auto bg-red-500 text-white text-xs px-2 py-0.5 rounded-full">
                      {pendingRequests}
                    </span>
                  )}
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="secondary"
                  onClick={() => router.push(`/${locale}/staff/categories`)}
                >
                  💲 {t('manage_categories') || 'Manage Categories'}
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="secondary"
                  onClick={() => router.push(`/${locale}/staff/availability`)}
                >
                  📅 {t('manage_availability') || 'Manage Availability'}
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="secondary"
                  onClick={() => router.push(`/${locale}/staff/reports`)}
                >
                  📊 {t('view_reports') || 'View Reports'}
                </Button>
              </>
            )}
            {!isManager && (
              <>
                <Button
                  className="w-full justify-start bg-amber-600 hover:bg-amber-700"
                  onClick={() => router.push(`/${locale}/staff/gate`)}
                >
                  🚪 {t('gate_check_in') || 'Gate Check-in'}
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="secondary"
                  onClick={() => router.push(`/${locale}/staff/settlement`)}
                >
                  🏦 {t('settlement') || 'Settlement'}
                </Button>
              </>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-stone-900 mb-4">
            {t('today_summary') || "Today's Summary"}
          </h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-stone-100">
              <span className="text-stone-500">{t('online_sales') || 'Online Sales'}</span>
              <span className="font-medium">ETB 2,180</span>
            </div>
            <div className="flex justify-between py-2 border-b border-stone-100">
              <span className="text-stone-500">{t('counter_sales') || 'Counter Sales'}</span>
              <span className="font-medium">ETB 1,110</span>
            </div>
            <div className="flex justify-between py-2 border-b border-stone-100">
              <span className="text-stone-500">{t('cancellations') || 'Cancellations'}</span>
              <span className="font-medium text-red-500">-ETB 150</span>
            </div>
            <div className="flex justify-between py-2 font-bold text-lg">
              <span>{t('net_revenue') || 'Net Revenue'}</span>
              <span className="text-amber-600">ETB 3,140</span>
            </div>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
