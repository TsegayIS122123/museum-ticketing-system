import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient } from '@/api/client';

/**
 * Admin reports — read-only hooks over `/reports/*`.
 *
 * Every schema is camelCase per contracts/openapi.yaml. Money fields are
 * typed `z.string()` because the contract declares them
 * `type: string, format: decimal`; consumers parse at the render boundary.
 * Do not type money as `z.number()` — that is the bug that broke the
 * manager summary (`revenueByCategory`) before it was fixed.
 *
 * The API grants these to Manager OR Admin; this module is the Admin
 * surface. Manager-facing reuse goes through `manager-dashboard.ts`.
 */

// ---------- shared bits ----------

const granularitySchema = z.enum(['daily', 'weekly', 'monthly']);

export type Granularity = z.infer<typeof granularitySchema>;

// ---------- attendance ----------

const attendanceByCategorySchema = z.object({
  category: z.string(),
  bookedTotal: z.number(),
  attendedTotal: z.number(),
  shortfallTotal: z.number(),
  shortfallRatePct: z.number().nullable(),
});

const attendanceReportSchema = z.object({
  from: z.string(),
  to: z.string(),
  bookedTotal: z.number(),
  attendedTotal: z.number(),
  shortfallTotal: z.number(),
  shortfallRatePct: z.number().nullable(),
  noShowBookingCount: z.number(),
  noShowHeadcount: z.number(),
  noShowRatePct: z.number().nullable(),
  correctedBookingCount: z.number(),
  currentlyFlaggedCount: z.number(),
  byCategory: z.array(attendanceByCategorySchema),
});

export type AttendanceReport = z.infer<typeof attendanceReportSchema>;

export async function fetchAttendance(from?: string, to?: string) {
  const res = await apiClient.get('/reports/attendance/', { params: { from, to } });
  return attendanceReportSchema.parse(res.data);
}

export function useAttendanceReport(from?: string, to?: string) {
  return useQuery({
    queryKey: ['admin-attendance', from, to],
    queryFn: () => fetchAttendance(from, to),
    staleTime: 60_000,
  });
}

// ---------- booking timeline ----------

const timelineDaySchema = z.object({
  date: z.string(),
  isOpenForBooking: z.boolean(),
  awaitingPaymentCount: z.number(),
  pendingCount: z.number(),
  visitedCount: z.number(),
  cancelledCount: z.number(),
  refundedCount: z.number(),
  awaitingPaymentHeadcount: z.number(),
  pendingHeadcount: z.number(),
  visitedHeadcount: z.number(),
  expectedHeadcount: z.number(),
});

const bookingTimelineSchema = z.object({
  from: z.string(),
  to: z.string(),
  days: z.array(timelineDaySchema),
});

export type BookingTimeline = z.infer<typeof bookingTimelineSchema>;

export async function fetchTimeline() {
  const res = await apiClient.get('/reports/booking-timeline/');
  return bookingTimelineSchema.parse(res.data);
}

export function useBookingTimeline() {
  return useQuery({
    queryKey: ['admin-timeline'],
    queryFn: fetchTimeline,
    staleTime: 60_000,
  });
}

// ---------- cashier balances ----------

const cashierBalanceSchema = z.object({
  cashierId: z.string().uuid(),
  cashierName: z.string(),
  outstandingBalanceEtb: z.string(),
  unreconciledBookingCount: z.number(),
});

const cashierBalancesSchema = z.object({
  cashiers: z.array(cashierBalanceSchema),
  totalOutstandingEtb: z.string(),
  totalReconciledEtb: z.string(),
  totalRevenueEtb: z.string(),
});

export type CashierBalances = z.infer<typeof cashierBalancesSchema>;

export async function fetchCashierBalances() {
  const res = await apiClient.get('/reports/cashier-balances/');
  return cashierBalancesSchema.parse(res.data);
}

export function useCashierBalances() {
  return useQuery({
    queryKey: ['admin-cashier-balances'],
    queryFn: fetchCashierBalances,
    staleTime: 60_000,
  });
}

// ---------- categories ----------

const categoryRowSchema = z.object({
  category: z.string(),
  bookedTotal: z.number(),
  attendedTotal: z.number(),
  revenueEtb: z.string(),
  revenueSharePct: z.number().nullable(),
});

const categoryBucketSchema = z.object({
  bucketStart: z.string(),
  countsByCategory: z.record(z.string(), z.number()),
});

const categoriesReportSchema = z.object({
  from: z.string(),
  to: z.string(),
  granularity: granularitySchema,
  categories: z.array(categoryRowSchema),
  periodBuckets: z.array(categoryBucketSchema),
});

export type CategoriesReport = z.infer<typeof categoriesReportSchema>;

export async function fetchCategoriesReport(from?: string, to?: string) {
  const res = await apiClient.get('/reports/categories/', { params: { from, to } });
  return categoriesReportSchema.parse(res.data);
}

export function useCategoriesReport(from?: string, to?: string) {
  return useQuery({
    queryKey: ['admin-categories', from, to],
    queryFn: () => fetchCategoriesReport(from, to),
    staleTime: 60_000,
  });
}

// ---------- period comparison ----------

const comparisonFigureSchema = z.object({
  from: z.string(),
  to: z.string(),
  revenueEtb: z.string(),
  bookingCount: z.number(),
  attendedTotal: z.number(),
  shortfallRatePct: z.number().nullable(),
});

const comparisonDeltasSchema = z.object({
  revenueEtbPct: z.number().nullable(),
  bookingCountPct: z.number().nullable(),
  attendedTotalPct: z.number().nullable(),
});

const periodComparisonSchema = z.object({
  current: comparisonFigureSchema,
  previous: comparisonFigureSchema,
  deltas: comparisonDeltasSchema,
});

export type PeriodComparison = z.infer<typeof periodComparisonSchema>;

export async function fetchComparison(from?: string, to?: string) {
  const res = await apiClient.get('/reports/comparison/', { params: { from, to } });
  return periodComparisonSchema.parse(res.data);
}

export function usePeriodComparison(from?: string, to?: string) {
  return useQuery({
    queryKey: ['admin-comparison', from, to],
    queryFn: () => fetchComparison(from, to),
    staleTime: 60_000,
  });
}

// ---------- institutions ----------

const institutionRowSchema = z.object({
  institutionId: z.string().uuid().nullable(),
  name: z.string(),
  tin: z.string().nullable(),
  visitCount: z.number(),
  distinctVisitDates: z.number(),
  bookedTotal: z.number(),
  attendedTotal: z.number(),
  revenueEtb: z.string(),
  firstVisit: z.string(),
  lastVisit: z.string(),
});

const institutionsReportSchema = z.object({
  from: z.string(),
  to: z.string(),
  data: z.array(institutionRowSchema),
  meta: z.object({
    limit: z.number(),
    offset: z.number(),
    total: z.number(),
  }),
});

export type InstitutionsReport = z.infer<typeof institutionsReportSchema>;

export async function fetchInstitutions(from?: string, to?: string) {
  const res = await apiClient.get('/reports/institutions/', { params: { from, to } });
  return institutionsReportSchema.parse(res.data);
}

export function useInstitutionsReport(from?: string, to?: string) {
  return useQuery({
    queryKey: ['admin-institutions', from, to],
    queryFn: () => fetchInstitutions(from, to),
    staleTime: 60_000,
  });
}

const institutionVisitSchema = z.object({
  bookingId: z.string().uuid(),
  reference: z.string(),
  visitDate: z.string(),
  checkedInAt: z.string().nullable(),
  headcountByCategory: z.record(z.string(), z.number()),
  bookedQuantity: z.number(),
  attendedQuantity: z.number().nullable(),
  amountEtb: z.string(),
  ifmisDocumentNo: z.string().nullable(),
  ifmisVoucherReference: z.string().nullable(),
});

const institutionDetailSchema = z.object({
  institution: z.object({
    id: z.string().uuid(),
    name: z.string(),
    nameAm: z.string().nullable(),
    tin: z.string().nullable(),
  }),
  from: z.string().nullable(),
  to: z.string().nullable(),
  visits: z.array(institutionVisitSchema),
});

export type InstitutionDetail = z.infer<typeof institutionDetailSchema>;

export async function fetchInstitutionDetail(id: string) {
  const res = await apiClient.get(`/reports/institutions/${id}/`);
  return institutionDetailSchema.parse(res.data);
}

export function useInstitutionDetail(id: string | null) {
  return useQuery({
    queryKey: ['admin-institution', id],
    queryFn: () => fetchInstitutionDetail(id!),
    enabled: !!id,
    staleTime: 60_000,
  });
}

// ---------- revenue ----------

const revenueBucketSchema = z.object({
  bucketStart: z.string(),
  grossEtb: z.string(),
  refundsEtb: z.string(),
  netEtb: z.string(),
});

const revenueReportSchema = z.object({
  from: z.string(),
  to: z.string(),
  granularity: granularitySchema,
  grossEtb: z.string(),
  refundsEtb: z.string(),
  netEtb: z.string(),
  individualEtb: z.string(),
  institutionalEtb: z.string(),
  revenueByCategory: z.record(z.string(), z.string()),
  periodBuckets: z.array(revenueBucketSchema),
});

export type RevenueReport = z.infer<typeof revenueReportSchema>;

export async function fetchRevenue(from?: string, to?: string) {
  const res = await apiClient.get('/reports/revenue/', { params: { from, to } });
  return revenueReportSchema.parse(res.data);
}

export function useRevenueReport(from?: string, to?: string) {
  return useQuery({
    queryKey: ['admin-revenue', from, to],
    queryFn: () => fetchRevenue(from, to),
    staleTime: 60_000,
  });
}
