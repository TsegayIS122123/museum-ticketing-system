'use client';

import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, ArrowUpDown } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { downloadCsv } from '@/lib/utils/download';
import { useTranslation } from '@/lib/i18n/useTranslation';
import {
  getAllInstitutions,
  getInstitutionDetail,
  getInstitutionsReport,
  type DateRange,
  type InstitutionSort,
} from '../api';
import { useReportData } from '../useReportData';
import { csvName, formatEtb, formatInt, formatReportDate, formatReportDateTime } from '../lib';
import { DefinitionNote, EmptyRange, ExportButton, ReportError, ReportSkeleton, SectionCard } from './ui';

const PAGE = 25;

function VisitHistory({ id, range }: { id: string; range: DateRange }) {
  const { t, locale } = useTranslation();
  const { data, loading, error } = useReportData(() => getInstitutionDetail(id, range), `${id}|${range.from}|${range.to}`);
  if (loading) return <div className="py-4 text-sm text-stone-600">{t('loading')}</div>;
  if (error || !data) return <ReportError message={error ?? ''} />;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-stone-600">
            {['rpt_col_date', 'rpt_col_checkin_time', 'rpt_col_headcount', 'rpt_col_booked', 'rpt_col_attended', 'rpt_col_amount', 'rpt_col_voucher'].map((k, i) => (
              <th key={k} className={`py-1.5 pr-3 font-semibold ${i >= 3 && i <= 5 ? 'text-right' : ''}`}>
                {t(k)}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.visits.map((v) => (
            <tr key={v.bookingId} className="border-t border-stone-200">
              <td className="py-1.5 pr-3 whitespace-nowrap">{formatReportDate(v.visitDate, locale)}</td>
              <td className="py-1.5 pr-3 whitespace-nowrap">{formatReportDateTime(v.checkedInAt, locale)}</td>
              <td className="py-1.5 pr-3">
                {Object.entries(v.headcountByCategory).map(([k, n]) => `${k} ${n}`).join(', ') || '-'}
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{v.bookedQuantity}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{v.attendedQuantity ?? '-'}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums">{formatEtb(v.amountEtb)}</td>
              <td className="py-1.5 pr-3 whitespace-nowrap">
                {v.ifmisDocumentNo || v.ifmisVoucherReference
                  ? `${v.ifmisDocumentNo ?? '-'} / ${v.ifmisVoucherReference ?? '-'}`
                  : t('rpt_voucher_pending')}
              </td>
            </tr>
          ))}
          {data.visits.length === 0 && (
            <tr>
              <td colSpan={7} className="py-4 text-center text-stone-600">{t('rpt_no_visits')}</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function SchoolsTab({ range }: { range: DateRange }) {
  const { t, locale } = useTranslation();
  const [sort, setSort] = useState<InstitutionSort>('-revenue_etb');
  const [offset, setOffset] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const key = `${range.from}|${range.to}|${sort}|${offset}`;
  const { data, loading, error } = useReportData(() => getInstitutionsReport(range, { sort, offset, limit: PAGE }), key);

  const toggleSort = (field: 'name' | 'visit_count' | 'attended_total' | 'revenue_etb') => {
    setOffset(0);
    setSort((s) => (s === `-${field}` ? field : (`-${field}` as InstitutionSort)));
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = await getAllInstitutions(range);
      downloadCsv(
        csvName('schools', range),
        [t('rpt_col_school'), t('rpt_col_tin'), t('rpt_col_visits'), t('rpt_col_visit_days'), t('rpt_col_booked'), t('rpt_col_attended'), t('rpt_col_revenue'), t('rpt_col_first_visit'), t('rpt_col_last_visit')],
        rows.map((r) => [r.name, r.tin ?? '', r.visitCount, r.distinctVisitDates, r.bookedTotal, r.attendedTotal, r.revenueEtb, r.firstVisit, r.lastVisit])
      );
    } finally {
      setExporting(false);
    }
  };

  if (error) return <ReportError message={error} />;
  if (loading && !data) return <ReportSkeleton kpis={0} />;
  if (!data) return null;

  const sortable = (field: 'name' | 'visit_count' | 'attended_total' | 'revenue_etb', label: string, right = true) => (
    <th scope="col" aria-sort={sort === field ? 'ascending' : sort === `-${field}` ? 'descending' : 'none'} className={`py-2 px-3 ${right ? 'text-right' : 'text-left'}`}>
      <button type="button" onClick={() => toggleSort(field)} className="inline-flex cursor-pointer items-center gap-1 text-xs font-semibold uppercase tracking-wider text-stone-600 hover:text-brand-primary">
        {label} <ArrowUpDown className="h-3 w-3" aria-hidden />
      </button>
    </th>
  );
  const plain = (label: string, right = true) => (
    <th scope="col" className={`py-2 px-3 text-xs font-semibold uppercase tracking-wider text-stone-600 ${right ? 'text-right' : 'text-left'}`}>{label}</th>
  );

  return (
    <div className="space-y-4">
      <DefinitionNote>{t('rpt_def_schools')}</DefinitionNote>
      <SectionCard
        title={t('rpt_schools_title')}
        caption={t('rpt_schools_caption', { n: data.meta.total })}
        action={<ExportButton onClick={exportCsv} disabled={exporting || data.meta.total === 0} />}
      >
        {data.data.length === 0 ? (
          <EmptyRange />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-stone-200 bg-stone-50">
                  <th className="w-8" />
                  {sortable('name', t('rpt_col_school'), false)}
                  {plain(t('rpt_col_tin'), false)}
                  {sortable('visit_count', t('rpt_col_visits'))}
                  {plain(t('rpt_col_visit_days'))}
                  {plain(t('rpt_col_booked'))}
                  {sortable('attended_total', t('rpt_col_attended'))}
                  {sortable('revenue_etb', t('rpt_col_revenue'))}
                  {plain(t('rpt_col_first_visit'), false)}
                  {plain(t('rpt_col_last_visit'), false)}
                </tr>
              </thead>
              <tbody>
                {data.data.map((r) => {
                  const rowKey = r.institutionId ?? `legacy-${r.name}`;
                  const open = openId === rowKey && !!r.institutionId;
                  return (
                    <Fragment key={rowKey}>
                      <tr className="border-b border-stone-100 hover:bg-stone-50">
                        <td className="pl-2">
                          {r.institutionId && (
                            <button type="button" aria-expanded={open} aria-label={t('rpt_toggle_history', { name: r.name })} onClick={() => setOpenId(open ? null : rowKey)} className="cursor-pointer rounded p-1 text-stone-600 hover:bg-stone-100">
                              {open ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                            </button>
                          )}
                        </td>
                        <td className="py-2 px-3 font-medium text-stone-900">{r.name}</td>
                        <td className="py-2 px-3 tabular-nums text-stone-600">{r.tin ?? t('rpt_no_tin')}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{formatInt(r.visitCount)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{formatInt(r.distinctVisitDates)}</td>
                        <td className="py-2 px-3 text-right tabular-nums text-stone-600">{formatInt(r.bookedTotal)}</td>
                        <td className="py-2 px-3 text-right tabular-nums font-medium">{formatInt(r.attendedTotal)}</td>
                        <td className="py-2 px-3 text-right tabular-nums">{formatEtb(r.revenueEtb)}</td>
                        <td className="py-2 px-3 whitespace-nowrap">{formatReportDate(r.firstVisit, locale)}</td>
                        <td className="py-2 px-3 whitespace-nowrap">{formatReportDate(r.lastVisit, locale)}</td>
                      </tr>
                      {open && r.institutionId && (
                        <tr className="bg-stone-50">
                          <td />
                          <td colSpan={9} className="px-3 py-3">
                            <VisitHistory id={r.institutionId} range={range} />
                          </td>
                        </tr>
                      )}
                    </Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {data.meta.total > PAGE && (
          <div className="no-print mt-4 flex items-center justify-between text-sm text-stone-600">
            <span>{t('rpt_page_range', { from: offset + 1, to: Math.min(offset + PAGE, data.meta.total), total: data.meta.total })}</span>
            <div className="flex gap-2">
              <Button size="sm" variant="secondary" disabled={offset === 0} onClick={() => setOffset(Math.max(0, offset - PAGE))}>{t('rpt_prev')}</Button>
              <Button size="sm" variant="secondary" disabled={offset + PAGE >= data.meta.total} onClick={() => setOffset(offset + PAGE)}>{t('rpt_next')}</Button>
            </div>
          </div>
        )}
      </SectionCard>
    </div>
  );
}
