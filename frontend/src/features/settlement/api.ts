import { apiClient } from '@/lib/api/client';

// Real backend model (contracts/openapi.yaml): settlement is NOT a
// selectable-list-of-bookings-then-batch-transfer flow. There is no
// endpoint that lists individual unsettled bookings. A cashier only ever
// sees her own aggregate outstanding balance and fires one no-parameter
// "reconcile" action against it.

export interface OutstandingBalance {
  balanceEtb: string; // decimal string, e.g. "1234.50"
}

export type ReconciliationStatus = 'pending' | 'completed' | 'failed';

export interface CashierReconciliation {
  id: string;
  cashierId: string;
  amountEtb: string; // decimal string
  chapaTransferReference: string | null;
  status: ReconciliationStatus;
  initiatedAt: string | null;
  completedAt: string | null;
  transferReceiptUrl: string | null;
  failureReason: string | null;
  createdAt: string;
}

export interface ReconciliationListResponse {
  data: CashierReconciliation[];
  meta: {
    limit: number;
    offset: number;
    total: number;
  };
}

// GET /settlement/my-balance/ -- Cashier only. Her own outstanding balance.
export async function getMyOutstandingBalance(): Promise<OutstandingBalance> {
  return apiClient.get<OutstandingBalance>('/settlement/my-balance/');
}

// POST /settlement/reconcile/ -- Cashier only. One-click: locks her
// outstanding bookings/refunds and calls Chapa Transfer. Takes no body --
// there is nothing to select, there is only "settle everything now".
export async function initiateReconciliation(): Promise<CashierReconciliation> {
  return apiClient.post<CashierReconciliation>('/settlement/reconcile/');
}

// GET /settlement/reconciliations/ -- any Staff member. Cashier sees only
// her own; Manager/Admin see everyone's.
export async function listReconciliations(params?: {
  limit?: number;
  offset?: number;
}): Promise<ReconciliationListResponse> {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  const qs = query.toString();
  return apiClient.get<ReconciliationListResponse>(
    `/settlement/reconciliations/${qs ? `?${qs}` : ''}`
  );
}

// There is no GET /settlement/reconciliations/{id}/ single-retrieve
// endpoint -- list only (Document 04's pattern of "no single retrieve"
// repeats here too, same as categories and admin staff). Finding one by
// id means paging through the list client-side.
export async function getReconciliation(id: string): Promise<CashierReconciliation | null> {
  let offset = 0;
  const limit = 100;
  while (true) {
    const response = await listReconciliations({ limit, offset });
    const match = response.data.find((r) => r.id === id);
    if (match) return match;
    if (offset + limit >= response.meta.total) return null;
    offset += limit;
  }
}
