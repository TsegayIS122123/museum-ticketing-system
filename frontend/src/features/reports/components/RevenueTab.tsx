'use client';

import { downloadCsv } from '@/lib/utils/download';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { getRevenueReport, type DateRange } from '../api';
import { useReportData } from '../useReportData';
import { bucketLabel, csvName, formatEtb, toNumber } from '../lib';
import { BarChart, CHART_COLORS } from './charts';
import { DefinitionNote, EmptyRange, ExportButton, KpiCard, ReportError, ReportSkeleton, SectionCard } from './ui';

export function RevenueTab({ range }: { range: DateRange }) {
  const { t, locale } = useTranslation();
  const { data, loading, error } = useReportData(() => getRevenueReport(range), `${range.from}|${range.to}`);
  if (error) return <ReportError message={error} />;
  if (loading || !data) return <ReportSkeleton kpis={3} />;

  const empty = toNumber(data.grossEtb) === 0 && toNumber(data.refundsEtb) === 0;
  const individual = toNumber(data.individualEtb);
  const institutional = toNumber(data.institutionalEtb);
  const splitTotal = individual + institutional;
  const byCategory = Object.entries(data.revenueByCategory).map(([name, v]) => ({ name, value: toNumber(v), raw: v }));
  const catMax = Math.max(1, ...byCategory.map((c) => c.value));
  const label = (iso: string) => bucketLabel(iso, data.granularity, locale);

  const exportCsv = () =>
    downloadCsv(
      csvName('revenue', range),
      [t('rpt_col_period'), t('rpt_col_gross'), t('rpt_col_refunds'), t('rpt_col_net')],
      data.periodBuckets.map((b) => [b.bucketStart, b.grossEtb, b.refundsEtb, b.netEtb])
    );

  return (
    <div className="space-y-6">
      <DefinitionNote>{t('rpt_def_revenue')}</DefinitionNote>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <KpiCard label={t('rpt_rev_gross')} value={formatEtb(data.grossEtb)} caption={t('rpt_rev_gross_cap')} />
        <KpiCard label={t('rpt_rev_refunds')} value={formatEtb(data.refundsEtb)} caption={t('rpt_rev_refunds_cap')} />
        <KpiCard label={t('rpt_rev_net')} value={formatEtb(data.netEtb)} caption={t('rpt_rev_net_cap')} />
      </div>
      {empty ? (
        <SectionCard title={t('rpt_rev_over_time')}>
          <EmptyRange />
        </SectionCard>
      ) : (
        <>
          <SectionCard title={t('rpt_rev_over_time')} caption={t('rpt_over_time_caption', { unit: t(`rpt_gran_${data.granularity}`) })} action={<ExportButton onClick={exportCsv} />}>
            <BarChart
              ariaLabel={t('rpt_rev_over_time')}
              bars={data.periodBuckets.map((b) => ({ label: label(b.bucketStart), value: toNumber(b.netEtb), title: `${label(b.bucketStart)}: ${formatEtb(b.netEtb)}` }))}
              formatValue={(n) => formatEtb(n).replace('ETB ', '')}
            />
            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-stone-200 bg-stone-50 text-xs uppercase tracking-wider text-stone-600">
                    <th className="py-2 px-3 text-left">{t('rpt_col_period')}</th>
                    <th className="py-2 px-3 text-right">{t('rpt_col_gross')}</th>
                    <th className="py-2 px-3 text-right">{t('rpt_col_refunds')}</th>
                    <th className="py-2 px-3 text-right">{t('rpt_col_net')}</th>
                  </tr>
                </thead>
                <tbody>
                  {data.periodBuckets.map((b) => (
                    <tr key={b.bucketStart} className="border-b border-stone-100">
                      <td className="py-2 px-3">{label(b.bucketStart)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{formatEtb(b.grossEtb)}</td>
                      <td className="py-2 px-3 text-right tabular-nums">{formatEtb(b.refundsEtb)}</td>
                      <td className="py-2 px-3 text-right tabular-nums font-medium">{formatEtb(b.netEtb)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </SectionCard>

          <div className="grid gap-6 lg:grid-cols-2">
            <SectionCard title={t('rpt_rev_by_category')} caption={t('rpt_rev_by_category_cap')}>
              <div className="space-y-3">
                {byCategory.map((c, i) => (
                  <div key={c.name} className="flex items-center gap-3 text-sm">
                    <div className="w-24 flex-shrink-0 text-stone-700">{c.name}</div>
                    <div className="h-3 flex-1 overflow-hidden rounded-full bg-stone-100">
                      <div className="h-full rounded-full" style={{ width: `${(c.value / catMax) * 100}%`, background: CHART_COLORS[i % CHART_COLORS.length] }} />
                    </div>
                    <div className="w-28 flex-shrink-0 text-right tabular-nums text-stone-700">{formatEtb(c.raw)}</div>
                  </div>
                ))}
              </div>
            </SectionCard>
            <SectionCard title={t('rpt_rev_split')} caption={t('rpt_rev_split_cap')}>
              <div className="mb-3 flex h-4 overflow-hidden rounded-full bg-stone-100" role="img" aria-label={t('rpt_rev_split')}>
                <div style={{ width: splitTotal ? `${(individual / splitTotal) * 100}%` : 0, background: CHART_COLORS[0] }} />
                <div style={{ width: splitTotal ? `${(institutional / splitTotal) * 100}%` : 0, background: CHART_COLORS[1] }} />
              </div>
              <dl className="space-y-2 text-sm">
                <div className="flex justify-between"><dt className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[0] }} />{t('rpt_rev_individual')}</dt><dd className="tabular-nums">{formatEtb(data.individualEtb)}</dd></div>
                <div className="flex justify-between"><dt className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full" style={{ background: CHART_COLORS[1] }} />{t('rpt_rev_institutional')}</dt><dd className="tabular-nums">{formatEtb(data.institutionalEtb)}</dd></div>
              </dl>
            </SectionCard>
          </div>
        </>
      )}
    </div>
  );
}
