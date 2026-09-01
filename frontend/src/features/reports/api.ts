import { apiClient } from '@/lib/api/client';

export type ReportPeriod = 'daily' | 'weekly' | 'monthly' | 'yearly';

export interface DashboardResponse {
  revenueTotalEtb: string;
  visitorCountsByCategory: Record<string, number>;
  groupVsIndividualSplit: {
    group: number;
    individual: number;
  };
  statusMix: {
    pending: number;
    visited: number;
    cancelled: number;
    refunded: number;
  };
}

export interface ReportSummaryResponse {
  period: ReportPeriod;
  from: string;
  to: string;
  revenueByCategory: Record<string, string>;
  visitorCountsByGroup: Record<string, number>;
}

// GET /reports/dashboard -- Museum Manager/Platform Admin only
export async function getDashboard(): Promise<DashboardResponse> {
  return apiClient.get<DashboardResponse>('/reports/dashboard');
}

// GET /reports/summary -- Museum Manager/Platform Admin only
export async function getReportSummary(period: ReportPeriod = 'daily'): Promise<ReportSummaryResponse> {
  return apiClient.get<ReportSummaryResponse>(`/reports/summary?period=${period}`);
}