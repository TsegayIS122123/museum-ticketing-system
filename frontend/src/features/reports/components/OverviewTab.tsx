'use client';

import { useTranslation } from '@/lib/i18n/useTranslation';
import {
  getAttendanceReport,
  getCategoriesReport,
  getPeriodComparison,
  getRevenueReport,
  type DateRange,
} from '../api';
import { useReportData } from '../useReportData';
import { bucketLabel, formatEtb, formatInt, formatPct, formatReportDate, toNumber } from '../lib';
import { BarChart, Legend, StackedBarChart } from './charts';
import { DeltaBadge, DefinitionNote, EmptyRange, KpiCard, ReportError, ReportSkeleton, SectionCard } from './ui';
import { OperationsPanel } from './OperationsPanel';

export function OverviewTab({ range }: { range: DateRange }) {
  const { t, locale } = useTranslation();
  const key = `${range.from}|${range.to}`;
  const cmp = useReportData(() => getPeriodComparison(range), key);
  const revenue = useReportData(() => getRevenueReport(range), key);
  const attendance = useReportData(() => getAttendanceReport(range), key);
  const categories = useReportData(() => getCategoriesReport(range), key);

  const error = cmp.error || revenue.error || attendance.error || categories.error;
  if (error) return <ReportError message={error} />;
  if (cmp.loading || revenue.loading || attendance.loading || categories.loading || !cmp.data || !revenue.data || !attendance.data || !categories.data) {
    return <ReportSkeleton />;
  }

  const c = cmp.data;
  const baseline = t('rpt_vs_previous', {
    from: formatReportDate(c.previous.from, locale, 'day-month'),
    to: formatReportDate(c.previous.to, locale, 'day-month'),
  });
  const hasData = c.current.bookingCount > 0 || c.current.attendedTotal > 0 || toNumber(revenue.data.netEtb) !== 0;
  const catKeys = categories.data.categories.map((x) => x.category);

  return (
    <div className="space-y-6">
      <DefinitionNote>{t('rpt_def_overview')}</DefinitionNote>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard
          label={t('rpt_kpi_visitors')}
          value={formatInt(c.current.attendedTotal)}
          caption={t('rpt_kpi_visitors_cap')}
          footer={<DeltaBadge pct={c.deltas.attendedTotalPct} baseline={baseline} />}
        />
        <KpiCard
          label={t('rpt_kpi_revenue')}
          value={formatEtb(c.current.revenueEtb)}
          caption={t('rpt_kpi_revenue_cap')}
          footer={<DeltaBadge pct={c.deltas.revenueEtbPct} baseline={baseline} />}
        />
        <KpiCard
          label={t('rpt_kpi_bookings')}
          value={formatInt(c.current.bookingCount)}
          caption={t('rpt_kpi_bookings_cap')}
          footer={<DeltaBadge pct={c.deltas.bookingCountPct} baseline={baseline} />}
        />
        <KpiCard
          label={t('rpt_kpi_no_show')}
          value={formatPct(attendance.data.noShowRatePct)}
          caption={t('rpt_kpi_no_show_cap', { n: attendance.data.noShowHeadcount })}
        />
      </div>

      {!hasData ? (
        <SectionCard title={t('rpt_trend_title')}>
          <EmptyRange />
        </SectionCard>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2">
          <SectionCard title={t('rpt_trend_revenue')} caption={t('rpt_trend_revenue_cap')}>
            <BarChart
              ariaLabel={t('rpt_trend_revenue')}
              bars={revenue.data.periodBuckets.map((b) => ({
                label: bucketLabel(b.bucketStart, revenue.data!.granularity, locale),
                value: toNumber(b.netEtb),
                title: `${bucketLabel(b.bucketStart, revenue.data!.granularity, locale)}: ${formatEtb(b.netEtb)}`,
              }))}
              formatValue={(n) => formatEtb(n).replace('ETB ', '')}
            />
          </SectionCard>
          <SectionCard title={t('rpt_trend_visitors')} caption={t('rpt_trend_visitors_cap')}>
            <StackedBarChart
              ariaLabel={t('rpt_trend_visitors')}
              keys={catKeys}
              buckets={categories.data.periodBuckets.map((b) => ({
                label: bucketLabel(b.bucketStart, categories.data!.granularity, locale),
                parts: Object.entries(b.countsByCategory).map(([k, v]) => ({ key: k, value: v })),
              }))}
            />
            <div className="mt-3">
              <Legend items={catKeys} />
            </div>
          </SectionCard>
        </div>
      )}

      <OperationsPanel />
    </div>
  );
}
