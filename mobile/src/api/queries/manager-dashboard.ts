import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient } from '@/api/client';

/**
 * Every ETB figure on these two endpoints is a decimal *string*, not a
 * number: DRF serializes `DecimalField`/`DictField(child=DecimalField)`
 * with `COERCE_DECIMAL_TO_STRING=True`, and the contract says so too
 * (`revenueTotalEtb: {type: string, format: decimal}`,
 * `ReportSummary.revenueByCategory: {additionalProperties: {type:
 * string, format: decimal}}`). Accepting `z.number()` here does not just
 * mis-type a field -- it fails the whole parse on a real payload, which
 * is why `revenueByCategory` used to blow up the Reports screen. Accept
 * both spellings so an older/lenient backend cannot break the screen
 * either, and parse with `toNumber` (utils/money) for display only.
 */
const decimalSchema = z.union([z.string(), z.number()]);

/**
 * `GET /reports/dashboard/` (FR-REPORT-001). Field names match
 * `DashboardSerializer` in backend/apps/reporting/serializers.py, which
 * emits camelCase keys over a snake_case service dict (`source=` mapping).
 */
const dashboardSchema = z.object({
  revenueTotalEtb: decimalSchema,
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
  revenueByCategory: z.record(z.string(), decimalSchema).optional(),
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
