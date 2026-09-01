import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api-types';

// Real backend model (contracts/openapi.yaml): settlement is NOT a
// selectable-list-of-bookings-then-batch-transfer flow. There is no
// endpoint that lists individual unsettled bookings. A cashier only ever
// sees her own aggregate outstanding balance and fires one no-parameter
// "reconcile" action against it.

export type OutstandingBalance = components['schemas']['OutstandingBalance'];
export type ReconciliationStatus = components['schemas']['CashierReconciliation']['status'];
export type CashierReconciliation = components['schemas']['CashierReconciliation'];
export type ReconciliationListResponse = components['schemas']['PaginatedCashierReconciliationList'];

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
