import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient } from '@/api/client';

const dashboardSchema = z.object({
  revenue_total_etb: z.number().or(z.string()),
  visitor_counts_by_category: z.record(z.string(), z.number()).optional(),
  group_vs_individual_split: z
    .object({ group: z.number(), individual: z.number() })
    .optional(),
  status_mix: z
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
  revenue_by_category: z.record(z.string(), z.number()).optional(),
  visitor_counts_by_group: z.record(z.string(), z.number()).optional(),
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
