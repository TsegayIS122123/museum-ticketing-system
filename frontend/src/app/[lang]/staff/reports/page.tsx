'use client';

import { useState } from 'react';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { PageContainer } from '@/components/layout/PageContainer';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { StatCard } from '@/components/ui/StatCard';
import { Table } from '@/components/ui/Table';

type Period = 'daily' | 'weekly' | 'monthly' | 'yearly';

export default function ReportsPage() {
  const { t } = useTranslation();
  const [period, setPeriod] = useState<Period>('daily');

  // Mock data - in production, fetch from API
  const stats = {
    totalVisitors: 124,
    totalRevenue: 3290,
    onlineSales: 2180,
    cancellations: 150,
  };

  const revenueByCategory = [
    { name: 'Adult', amount: 1575, pct: 48 },
    { name: 'Student', amount: 745, pct: 23 },
    { name: 'Foreign Resident', amount: 520, pct: 16 },
    { name: 'Non-Resident', amount: 450, pct: 13 },
  ];

  const bookingSummary = [
    ['27 Dec 2024', '32', '124', '18', '14', 'ETB 3,290', '2'],
    ['26 Dec 2024', '28', '108', '15', '13', 'ETB 2,840', '1'],
    ['25 Dec 2024', '12', '48', '8', '4', 'ETB 1,200', '3'],
    ['24 Dec 2024', '35', '140', '22', '13', 'ETB 3,580', '0'],
    ['23 Dec 2024', '30', '118', '19', '11', 'ETB 2,960', '1'],
  ];

  const periodOptions: { value: Period; label: string }[] = [
    { value: 'daily', label: t('daily') || 'Daily' },
    { value: 'weekly', label: t('weekly') || 'Weekly' },
    { value: 'monthly', label: t('monthly') || 'Monthly' },
    { value: 'yearly', label: t('yearly') || 'Yearly' },
  ];

  const headers = [
    t('date') || 'Date',
    t('bookings') || 'Bookings',
    t('visitors') || 'Visitors',
    t('online') || 'Online',
    t('counter') || 'Counter',
    t('revenue') || 'Revenue',
    t('cancellations') || 'Cancellations',
  ];

  return (
    <PageContainer>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="font-serif text-3xl text-stone-900">
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
                  ? 'bg-slate-800 text-white border-slate-800'
                  : 'border-stone-200 text-stone-700 hover:border-slate-400'
              }`}
            >
              {p.label}
            </button>
          ))}
          <Button variant="secondary" size="sm">
            ⬇ {t('export') || 'Export'}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
        <StatCard
          label={t('total_visitors') || 'Total Visitors'}
          value={stats.totalVisitors}
          sub="↑ 12% vs prior period"
          color="green"
        />
        <StatCard
          label={t('total_revenue') || 'Total Revenue'}
          value={`ETB ${stats.totalRevenue}`}
          sub="Online + Counter"
          color="amber"
        />
        <StatCard
          label={t('online_sales') || 'Online Sales'}
          value={`ETB ${stats.onlineSales}`}
          sub="66% of total"
          color="blue"
        />
        <StatCard
          label={t('cancellations') || 'Cancellations'}
          value={`ETB ${stats.cancellations}`}
          sub="Refunded"
          color="red"
        />
      </div>

      <div className="grid md:grid-cols-2 gap-5 mb-5">
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
                    style={{ width: `${cat.pct}%` }}
                  />
                </div>
                <div className="w-20 text-right text-stone-500 flex-shrink-0">
                  ETB {cat.amount}
                </div>
              </div>
            ))}
          </div>
        </Card>

        <Card>
          <div className="font-semibold text-stone-900 mb-5">
            {t('sales_channel') || 'Sales Channel Breakdown'}
          </div>
          <div className="space-y-3 text-sm">
            {[
              { label: t('online_fpx_card') || 'Online (FPX/Card)', amount: 1580, pct: 48, color: 'bg-slate-800' },
              { label: t('e_wallet') || 'e-Wallet', amount: 600, pct: 18, color: 'bg-slate-600' },
              { label: t('counter_cash') || 'Counter (Cash)', amount: 710, pct: 22, color: 'bg-amber-500' },
              { label: t('counter_card') || 'Counter (Card)', amount: 400, pct: 12, color: 'bg-amber-300' },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3">
                <div className="w-28 text-stone-600 flex-shrink-0">{item.label}</div>
                <div className="flex-1 bg-stone-100 rounded-full h-3 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${item.color}`}
                    style={{ width: `${item.pct}%` }}
                  />
                </div>
                <div className="w-20 text-right text-stone-500">ETB {item.amount}</div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      <Card padding={false}>
        <div className="p-5 border-b border-stone-200 font-semibold text-stone-900">
          {t('booking_summary') || 'Booking Summary'}
        </div>
        <Table headers={headers} rows={bookingSummary} />
      </Card>
    </PageContainer>
  );
}
