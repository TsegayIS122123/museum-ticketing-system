import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient } from '@/api/client';

/**
 * `GET /reports/dashboard` (FR-REPORT-001). Field names match
 * `DashboardSerializer` in backend/apps/reporting/serializers.py, which
 * emits camelCase keys over a snake_case service dict (`source=` mapping).
 */
const dashboardSchema = z.object({
  revenueTotalEtb: z.number().or(z.string()),
  visitorCountsByCategory: z.record(z.string(), z.number()).optional(),
  groupVsIndividualSplit: z
    .object({ group: z.number(), individual: z.number() })
    .optional(),
  statusMix: z
    .object({
      pending: z.number(),
      visited: z.number(),
      cancelled: z.number(),
      refunded: z.number(),
    })
    .optional(),
});

export type Dashboard = z.infer<typeof dashboardSchema>;

export async function fetchDashboard(): Promise<Dashboard> {
  const res = await apiClient.get('/reports/dashboard/');
  return dashboardSchema.parse(res.data);
}

export function useDashboard() {
  return useQuery({
    queryKey: ['manager-dashboard'],
    queryFn: fetchDashboard,
    staleTime: 30_000,
  });
}

// ---------- summary ----------

const summarySchema = z.object({
  period: z.enum(['daily', 'weekly', 'monthly', 'yearly']),
  from: z.string(),
  to: z.string(),
  bookingCount: z.number().optional(),
  revenueByCategory: z.record(z.string(), z.number()).optional(),
  visitorCountsByGroup: z.record(z.string(), z.number()).optional(),
});

export type ReportSummary = z.infer<typeof summarySchema>;

export async function fetchSummary(period: string, from?: string, to?: string) {
  const res = await apiClient.get('/reports/summary/', {
    params: { period, from, to },
  });
  return summarySchema.parse(res.data);
}

export function useSummary(period: string, from?: string, to?: string) {
  return useQuery({
    queryKey: ['manager-summary', period, from, to],
    queryFn: () => fetchSummary(period, from, to),
    staleTime: 60_000,
  });
}
