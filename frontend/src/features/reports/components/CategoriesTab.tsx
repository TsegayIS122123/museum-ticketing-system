'use client';

import { downloadCsv } from '@/lib/utils/download';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { getCategoriesReport, type DateRange } from '../api';
import { useReportData } from '../useReportData';
import { bucketLabel, csvName, formatEtb, formatInt, formatPct, toNumber } from '../lib';
import { DonutChart, Legend, StackedBarChart } from './charts';
import { DefinitionNote, EmptyRange, ExportButton, ReportError, ReportSkeleton, SectionCard } from './ui';

export function CategoriesTab({ range }: { range: DateRange }) {
  const { t, locale } = useTranslation();
  const { data, loading, error } = useReportData(() => getCategoriesReport(range), `${range.from}|${range.to}`);
  if (error) return <ReportError message={error} />;
  if (loading || !data) return <ReportSkeleton kpis={0} />;

  const names = data.categories.map((c) => c.category);
  const totalAttended = data.categories.reduce((s, c) => s + c.attendedTotal, 0);
  const empty = data.categories.length === 0;

  const exportCsv = () =>
    downloadCsv(
      csvName('categories', range),
      [t('rpt_col_category'), t('rpt_col_booked'), t('rpt_col_attended'), t('rpt_col_revenue'), t('rpt_col_share')],
      data.categories.map((c) => [c.category, c.bookedTotal, c.attendedTotal, c.revenueEtb, c.revenueSharePct ?? ''])
    );

  return (
    <div className="space-y-6">
      <DefinitionNote>{t('rpt_def_categories')}</DefinitionNote>
      {empty ? (
        <SectionCard title={t('rpt_categories_title')}>
          <EmptyRange />
        </SectionCard>
      ) : (
        <>
          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title={t('rpt_share_title')} caption={t('rpt_share_caption')}>
              <div className="flex flex-wrap items-center gap-6">
                <DonutChart
                  ariaLabel={t('rpt_share_title')}
                  centerLabel={t('rpt_kpi_visitors')}
                  centerValue={formatInt(totalAttended)}
                  slices={data.categories.map((c) => ({ key: c.category, value: c.attendedTotal }))}
                />
                <Legend items={names} />
              </div>
            </SectionCard>
            <SectionCard title={t('rpt_over_time')} caption={t('rpt_over_time_caption', { unit: t(`rpt_gran_${data.granularity}`) })}>
              <StackedBarChart
                ariaLabel={t('rpt_over_time')}
                keys={names}
                buckets={data.periodBuckets.map((b) => ({
                  label: bucketLabel(b.bucketStart, data.granularity, locale),
                  parts: Object.entries(b.countsByCategory).map(([k, v]) => ({ key: k, value: v })),
                }))}
              />
            </SectionCard>
          </div>
          <SectionCard title={t('rpt_categories_title')} action={<ExportButton onClick={exportCsv} />}>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wider text-stone-600">
                    <th className="py-2 px-3 text-left">{t('rpt_col_category')}</th>
                    <th className="py-2 px-3 text-right">{t('rpt_col_booked')}</th>
                    <th className="py-2 px-3 text-right">{t('rpt_col_attended')}</th>
                    <th className="py-2 px-3 text-right">{t('rpt_col_revenue')}</th>
                    <th className="py-2 px-3 text-right">{t('rpt_col_share')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.categories.map((c) => (
                    <tr key={c.category} className="border-b border-stone-100">
                      <td className="py-2 px-3 font-medium">{c.category}</td>
                      <td className="py-2 px-3 text-right tabular-nums text-stone-600">{formatInt(c.bookedTotal)}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-medium">{formatInt(c.attendedTotal)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{formatEtb(c.revenueEtb)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{formatPct(c.revenueSharePct)}</td>
                    </tr>
                  ))}
                  <tr className="bg-stone-50 font-semibold">
                    <td className="py-2 px-3">{t('rpt_total')}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{formatInt(data.categories.reduce((s, c) => s + c.bookedTotal, 0))}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{formatInt(totalAttended)}</td>
                    <td className="py-2 px-3 text-right tabular-nums">{formatEtb(data.categories.reduce((s, c) => s + toNumber(c.revenueEtb), 0))}</td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>
          </SectionCard>
        </>
      )}
    </div>
  );
}
