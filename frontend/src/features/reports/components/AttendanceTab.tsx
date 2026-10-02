'use client';

import Link from 'next/link';
import { downloadCsv } from '@/lib/utils/download';
import { useTranslation } from '@/lib/i18n/useTranslation';
import { getAttendanceReport, type DateRange } from '../api';
import { useReportData } from '../useReportData';
import { csvName, formatInt, formatPct } from '../lib';
import { PairedBars } from './charts';
import { DefinitionNote, EmptyRange, ExportButton, KpiCard, ReportError, ReportSkeleton, SectionCard } from './ui';

export function AttendanceTab({ range }: { range: DateRange }) {
  const { t, locale } = useTranslation();
  const { data, loading, error } = useReportData(() => getAttendanceReport(range), `${range.from}|${range.to}`);
  if (error) return <ReportError message={error} />;
  if (loading || !data) return <ReportSkeleton />;

  const empty = data.bookedTotal === 0 && data.noShowBookingCount === 0;
  const exportCsv = () =>
    downloadCsv(
      csvName('attendance', range),
      [t('rpt_col_category'), t('rpt_col_booked'), t('rpt_col_attended'), t('rpt_col_shortfall'), t('rpt_col_shortfall_rate')],
      data.byCategory.map((c) => [c.category, c.bookedTotal, c.attendedTotal, c.shortfallTotal, c.shortfallRatePct ?? ''])
    );

  return (
    <div className="space-y-6">
      <DefinitionNote>{t('rpt_def_attendance')}</DefinitionNote>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KpiCard label={t('rpt_att_booked')} value={formatInt(data.bookedTotal)} caption={t('rpt_att_booked_cap')} />
        <KpiCard label={t('rpt_att_attended')} value={formatInt(data.attendedTotal)} caption={t('rpt_att_attended_cap')} />
        <KpiCard label={t('rpt_kpi_no_show')} value={formatPct(data.noShowRatePct)} caption={t('rpt_att_noshow_cap', { b: data.noShowBookingCount, n: data.noShowHeadcount })} />
        <KpiCard label={t('rpt_att_shortfall')} value={formatPct(data.shortfallRatePct)} caption={t('rpt_att_shortfall_cap', { n: data.shortfallTotal })} />
      </div>

      <SectionCard title={t('rpt_att_workload')} caption={t('rpt_att_workload_cap')}>
        <div className="flex flex-wrap items-center gap-6 text-sm">
          <div>
            <span className="font-serif text-2xl font-semibold tabular-nums">{formatInt(data.correctedBookingCount)}</span>{' '}
            <span className="text-stone-600">{t('rpt_att_corrected')}</span>
          </div>
          <div>
            <span className="font-serif text-2xl font-semibold tabular-nums">{formatInt(data.currentlyFlaggedCount)}</span>{' '}
            <span className="text-stone-600">{t('rpt_att_flagged')}</span>{' '}
            {data.currentlyFlaggedCount > 0 && (
              <Link href={`/${locale}/staff/attendance`} className="no-print font-medium text-brand-primary underline">
                {t('rpt_att_open_queue')}
              </Link>
            )}
          </div>
        </div>
      </SectionCard>

      <SectionCard title={t('rpt_att_by_category')} action={<ExportButton onClick={exportCsv} disabled={empty} />}>
        {data.byCategory.length === 0 ? (
          <EmptyRange />
        ) : (
          <PairedBars
            leftLabel={t('rpt_col_booked')}
            rightLabel={t('rpt_col_attended')}
            rows={data.byCategory.map((c) => ({ label: c.category, left: c.bookedTotal, right: c.attendedTotal }))}
          />
        )}
      </SectionCard>
    </div>
  );
}
