'use client';

import { useState, useEffect } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Button } from '@/components/ui/Button';
import { PageContainer } from '@/components/layout/PageContainer';

export default function StaffDashboardPage() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [isLoading, setIsLoading] = useState(true);

  // Mock data - in production, fetch from API
  const [stats, setStats] = useState({
    totalRevenue: 3290,
    visitorsToday: 124,
    checkIns: 98,
    pendingRequests: 2,
  });

  useEffect(() => {
    // Simulate loading
    const timer = setTimeout(() => setIsLoading(false), 500);
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
          value={stats.pendingRequests}
          sub="Group bookings"
          color="red"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <h3 className="font-semibold text-stone-900 mb-4">
            {t('quick_actions') || 'Quick Actions'}
          </h3>
          <div className="space-y-3">
            <Button className="w-full justify-start bg-amber-600 hover:bg-amber-700">
              🎫 {t('new_booking') || 'New Booking'}
            </Button>
            <Button className="w-full justify-start" variant="secondary">
              📊 {t('view_reports') || 'View Reports'}
            </Button>
            <Button className="w-full justify-start" variant="secondary">
              👥 {t('manage_group_bookings') || 'Manage Group Bookings'}
            </Button>
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
