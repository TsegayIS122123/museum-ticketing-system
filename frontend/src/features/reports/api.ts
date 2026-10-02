import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api-types';
import type { BookingTimeline, CashierBalances, ReportSummary } from '@/lib/api-contract';

export type ReportPeriod = components['schemas']['PeriodEnum'];
export type DashboardResponse = components['schemas']['Dashboard'];
export type ReportSummaryResponse = ReportSummary;
export type CashierBalancesResponse = CashierBalances;
export type BookingTimelineResponse = BookingTimeline;

// GET /reports/dashboard -- Museum Manager/Platform Admin only
export async function getDashboard(): Promise<DashboardResponse> {
  return apiClient.get<DashboardResponse>('/reports/dashboard');
}

// GET /reports/summary -- Museum Manager/Platform Admin only
export async function getReportSummary(period: ReportPeriod = 'daily'): Promise<ReportSummaryResponse> {
  return apiClient.get<ReportSummaryResponse>(`/reports/summary?period=${period}`);
}

// GET /reports/cashier-balances -- Museum Manager/Platform Admin only
// (FR-REPORT-003). Every Cashier's current outstanding balance, so a
// Manager can check it against total revenue.
export async function getCashierBalances(): Promise<CashierBalancesResponse> {
  return apiClient.get<CashierBalancesResponse>('/reports/cashier-balances');
}

// GET /reports/booking-timeline -- Museum Manager/Platform Admin only.
// A day-by-day awaiting/pending/visited/cancelled/refunded breakdown a
// Manager can use to spot a crowded upcoming date and close it in
// Availability. Omit both `from`/`to` for the default forward-looking
// two-week window (see backend/apps/reporting/services.py's
// `get_booking_timeline` for why the default looks forward rather than
// back); the backend rejects one of the two being provided without the
// other.
export async function getBookingTimeline(range?: { from: string; to: string }): Promise<BookingTimelineResponse> {
  const query = range ? `?from=${range.from}&to=${range.to}` : '';
  return apiClient.get<BookingTimelineResponse>(`/reports/booking-timeline${query}`);
}


// ---------------------------------------------------------------------
// Phase 7b/7c (UAT round 1): range-driven reports. Every endpoint below
// takes either a `preset` or an explicit `from`/`to` pair -- see
// backend/apps/reporting/services.py::resolve_report_range. The page
// always sends an explicit `from`/`to` (resolved client-side from the
// URL), so one range value drives every tab identically.
// ---------------------------------------------------------------------

export type InstitutionsReportResponse = components['schemas']['InstitutionsReport'];
export type InstitutionsReportRow = components['schemas']['InstitutionsReportRow'];
export type InstitutionDetailResponse = components['schemas']['InstitutionDetail'];
export type CategoriesReportResponse = components['schemas']['CategoriesReport'];
export type AttendanceReportResponse = components['schemas']['AttendanceReport'];
export type RevenueReportResponse = components['schemas']['RevenueReport'];
export type PeriodComparisonResponse = components['schemas']['PeriodComparison'];

export interface DateRange {
  from: string;
  to: string;
}

export type InstitutionSort =
  | 'name'
  | '-name'
  | 'visit_count'
  | '-visit_count'
  | 'attended_total'
  | '-attended_total'
  | 'revenue_etb'
  | '-revenue_etb';

const rangeQuery = (range: DateRange) => `from=${range.from}&to=${range.to}`;

export async function getInstitutionsReport(
  range: DateRange,
  opts: { sort?: InstitutionSort; limit?: number; offset?: number } = {}
): Promise<InstitutionsReportResponse> {
  const { sort = '-revenue_etb', limit = 25, offset = 0 } = opts;
  return apiClient.get<InstitutionsReportResponse>(
    `/reports/institutions?${rangeQuery(range)}&sort=${sort}&limit=${limit}&offset=${offset}`
  );
}

// Unbounded-by-the-UI fetch used only for the CSV export, so the file
// holds every institution in the range rather than just the visible page.
export async function getAllInstitutions(range: DateRange): Promise<InstitutionsReportRow[]> {
  const pageSize = 200;
  const rows: InstitutionsReportRow[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await getInstitutionsReport(range, { limit: pageSize, offset });
    rows.push(...page.data);
    if (rows.length >= page.meta.total || page.data.length === 0) break;
  }
  return rows;
}

export async function getInstitutionDetail(
  id: string,
  range: DateRange
): Promise<InstitutionDetailResponse> {
  return apiClient.get<InstitutionDetailResponse>(`/reports/institutions/${id}?${rangeQuery(range)}`);
}

export async function getCategoriesReport(range: DateRange): Promise<CategoriesReportResponse> {
  return apiClient.get<CategoriesReportResponse>(`/reports/categories?${rangeQuery(range)}`);
}

export async function getAttendanceReport(range: DateRange): Promise<AttendanceReportResponse> {
  return apiClient.get<AttendanceReportResponse>(`/reports/attendance?${rangeQuery(range)}`);
}

export async function getRevenueReport(range: DateRange): Promise<RevenueReportResponse> {
  return apiClient.get<RevenueReportResponse>(`/reports/revenue?${rangeQuery(range)}`);
}

export async function getPeriodComparison(range: DateRange): Promise<PeriodComparisonResponse> {
  return apiClient.get<PeriodComparisonResponse>(`/reports/comparison?${rangeQuery(range)}`);
}
