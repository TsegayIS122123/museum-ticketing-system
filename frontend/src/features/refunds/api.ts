import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api-types';

export type Refund = components['schemas']['Refund'];
export type RefundListResponse = components['schemas']['PaginatedRefundList'];

// GET /refunds -- Visitors see only their own; Staff see all. `reason`
// filters across all three Refund.Reason values (services.list_refunds
// on the backend) -- present on the real endpoint but missing from a
// previous version of the OpenAPI contract, same class of
// under-documentation as the other list endpoints in this app.
export async function getRefunds(params?: {
  limit?: number;
  offset?: number;
  reason?: Refund['reason'];
}): Promise<RefundListResponse> {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  if (params?.reason) query.set('reason', params.reason);
  const qs = query.toString();
  return apiClient.get<RefundListResponse>(`/refunds${qs ? `?${qs}` : ''}`);
}

// POST /bookings/{id}/refund-requests -- Visitor only (FR-TICKET-002,
// FR-REFUND-001b). Only succeeds against the booking's own Visitor, and
// only when the booking is Visited with a recorded, unrefunded shortfall
// (attendedQuantity < bookedQuantity) -- services.
// request_partial_shortfall_refund raises a 409 (Conflict) otherwise,
// including on a second attempt against the same shortfall (the
// per-booking uniqueness guard mentioned in apps.refunds.models.Refund's
// own docstring).
export async function requestPartialRefund(bookingId: string, note?: string | null): Promise<Refund> {
  return apiClient.post<Refund>(`/bookings/${bookingId}/refund-requests`, { note: note ?? null });
}
