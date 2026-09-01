import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api-types';
import type { ReportSummary } from '@/lib/api-contract';

export type ReportPeriod = components['schemas']['PeriodEnum'];
export type DashboardResponse = components['schemas']['Dashboard'];
export type ReportSummaryResponse = ReportSummary;

// GET /reports/dashboard -- Museum Manager/Platform Admin only
export async function getDashboard(): Promise<DashboardResponse> {
  return apiClient.get<DashboardResponse>('/reports/dashboard');
}

// GET /reports/summary -- Museum Manager/Platform Admin only
export async function getReportSummary(period: ReportPeriod = 'daily'): Promise<ReportSummaryResponse> {
  return apiClient.get<ReportSummaryResponse>(`/reports/summary?period=${period}`);
}
