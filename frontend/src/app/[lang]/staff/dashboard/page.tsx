'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';
import { useAuth } from '@/lib/auth/auth-context';
import { Card } from '@/components/ui/Card';
import { StatCard } from '@/components/ui/StatCard';
import { Button } from '@/components/ui/Button';
import { PageContainer } from '@/components/layout/PageContainer';
import { useRouter } from 'next/navigation';

export default function StaffDashboardPage() {
  const { t, locale } = useTranslation();
  const router = useRouter();
  const { user } = useAuth();

  const stats = {
    totalRevenue: 3290,
    visitorsToday: 124,
    checkIns: 98,
    pendingRequests: 2,
  };

  const isManager = user?.role === 'museum_manager';

  return (
    <PageContainer>
      <div className="mb-8">
        <div className="text-xs text-stone-400 uppercase tracking-wider mb-1">
          Welcome back
        </div>
        <h1 className="font-serif text-4xl text-stone-900">
          {user?.full_name || 'Staff'}
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
          label="Today's Revenue"
          value={`ETB ${stats.totalRevenue}`}
          sub="32 transactions"
          color="green"
        />
        <StatCard
          label="Visitors Today"
          value={stats.visitorsToday}
          sub="Total check-ins"
          color="amber"
        />
        <StatCard
          label="Check-ins"
          value={stats.checkIns}
          sub="79% of expected"
          color="blue"
        />
        <StatCard
          label="Pending Requests"
          value={stats.pendingRequests}
          sub="Group bookings"
          color="red"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <h3 className="font-semibold text-stone-900 mb-4">Quick Actions</h3>
          <div className="space-y-3">
            {isManager ? (
              <>
                <Button
                  className="w-full justify-start"
                  variant="secondary"
                  onClick={() => router.push(`/${locale}/staff/group-bookings`)}
                >
                  👥 Manage Group Bookings
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="secondary"
                  onClick={() => router.push(`/${locale}/staff/categories`)}
                >
                  💲 Manage Categories
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="secondary"
                  onClick={() => router.push(`/${locale}/staff/availability`)}
                >
                  📅 Manage Availability
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="secondary"
                  onClick={() => router.push(`/${locale}/staff/reports`)}
                >
                  📊 View Reports
                </Button>
              </>
            ) : (
              <>
                <Button
                  className="w-full justify-start bg-amber-600 hover:bg-amber-700"
                  onClick={() => router.push(`/${locale}/staff/gate`)}
                >
                  🚪 Gate Check-in
                </Button>
                <Button
                  className="w-full justify-start"
                  variant="secondary"
                  onClick={() => router.push(`/${locale}/staff/settlement`)}
                >
                  🏦 Settlement
                </Button>
              </>
            )}
          </div>
        </Card>

        <Card>
          <h3 className="font-semibold text-stone-900 mb-4">Today's Summary</h3>
          <div className="space-y-3 text-sm">
            <div className="flex justify-between py-2 border-b border-stone-100">
              <span className="text-stone-500">Online Sales</span>
              <span className="font-medium">ETB 2,180</span>
            </div>
            <div className="flex justify-between py-2 border-b border-stone-100">
              <span className="text-stone-500">Counter Sales</span>
              <span className="font-medium">ETB 1,110</span>
            </div>
            <div className="flex justify-between py-2 border-b border-stone-100">
              <span className="text-stone-500">Cancellations</span>
              <span className="font-medium text-red-500">-ETB 150</span>
            </div>
            <div className="flex justify-between py-2 font-bold text-lg">
              <span>Net Revenue</span>
              <span className="text-amber-600">ETB 3,140</span>
            </div>
          </div>
        </Card>
      </div>
    </PageContainer>
  );
}
