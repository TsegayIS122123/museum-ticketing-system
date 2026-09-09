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

