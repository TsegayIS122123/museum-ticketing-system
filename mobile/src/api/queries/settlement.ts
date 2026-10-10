import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient } from '@/api/client';

// ---------- balance ----------
// `GET /settlement/my-balance/` returns the contract's `OutstandingBalance`
// (camelCase), not a snake_case `outstanding_etb`/`booking_count` pair.

const balanceSchema = z.object({
  balanceEtb: z.string(),
  pendingVoucherCount: z.number().optional(),
});

export type OutstandingBalance = z.infer<typeof balanceSchema>;

export async function fetchBalance(): Promise<OutstandingBalance> {
  const res = await apiClient.get('/settlement/my-balance/');
  return balanceSchema.parse(res.data);
}

export function useBalance() {
  return useQuery({
    queryKey: ['settlement-balance'],
    queryFn: fetchBalance,
    staleTime: 15_000,
  });
}

// ---------- reconcile ----------

const reconcileSchema = z.object({
  id: z.string().uuid(),
  cashierId: z.string().uuid().optional(),
  amountEtb: z.string(),
  status: z.enum(['pending', 'completed', 'failed']),
  chapaTransferReference: z.string().nullable().optional(),
  initiatedAt: z.string().nullable().optional(),
  completedAt: z.string().nullable().optional(),
  failureReason: z.string().nullable().optional(),
  transferReceiptUrl: z.string().nullable().optional(),
  createdAt: z.string().optional(),
});

export type Reconciliation = z.infer<typeof reconcileSchema>;

export async function reconcile(): Promise<Reconciliation> {
  const res = await apiClient.post('/settlement/reconcile/');
  return reconcileSchema.parse(res.data);
}

export function useReconcile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: reconcile,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['settlement-balance'] });
      qc.invalidateQueries({ queryKey: ['settlement-history'] });
    },
  });
}

// ---------- history ----------

const listSchema = z.object({
  data: z.array(reconcileSchema),
  meta: z.object({
    limit: z.number(),
    offset: z.number(),
    total: z.number(),
  }),
});

export async function fetchHistory(): Promise<Reconciliation[]> {
  const res = await apiClient.get('/settlement/reconciliations/');
  const parsed = listSchema.parse(res.data);
  return parsed.data;
}

export function useSettlementHistory() {
  return useQuery({
    queryKey: ['settlement-history'],
    queryFn: fetchHistory,
    staleTime: 30_000,
  });
}
