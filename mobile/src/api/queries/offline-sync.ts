import { z } from 'zod';
import { apiClient } from '@/api/client';

export interface SyncCheckInPayload {
  idempotencyKey: string;
  bookingId: string;
  reference: string;
  attendedQuantity: number;
  occurredAt: string; // ISO timestamp from the cashier's device
}

const syncResponseSchema = z.object({
  status: z.enum(['accepted', 'rejected', 'conflict']),
  reason: z.string().optional(),
  bookingId: z.string().optional(),
});

export type SyncResponse = z.infer<typeof syncResponseSchema>;

/**
 * Send one offline check-in to the server.
 *
 * Returns:
 *   - `accepted` — booking is now `visited` server-side
 *   - `rejected` — the request was invalid (bad reference, wrong state)
 *   - `conflict` — the booking was already checked in by another cashier
 *
 * The backend endpoint is `POST /api/v1/entrance/offline-sync/`
 * (see docs/09 §10.3 — Phase 0 backend prerequisite). If it does not
 * exist yet, this call will 404 and the queue will retry — no data loss.
 */
export async function syncCheckIn(payload: SyncCheckInPayload): Promise<SyncResponse> {
  const res = await apiClient.post('/entrance/offline-sync/', payload);
  return syncResponseSchema.parse(res.data);
}

/**
 * Download the cashier's authorized bookings for a date range, to seed the
 * offline cache. Endpoint is `GET /api/v1/mobile/cashier/bookings/`
 * (Phase 0 prerequisite); if absent, callers should fall back to
 * `GET /bookings/?visitDate=...`.
 */
const downloadSchema = z.object({
  data: z.array(
    z.object({
      id: z.string().uuid(),
      reference: z.string(),
      status: z.string(),
      visit_date: z.string(),
      booking_type: z.string().optional(),
      group_name: z.string().nullable().optional(),
      booked_quantity: z.number().optional(),
      items: z.array(z.any()).optional(),
      total_amount_etb: z.string().optional(),
    })
  ),
});

export type DownloadResponse = z.infer<typeof downloadSchema>;

export async function downloadCashierBookings(params: {
  from: string;
  to: string;
}): Promise<DownloadResponse> {
  const res = await apiClient.get('/mobile/cashier/bookings/', { params });
  return downloadSchema.parse(res.data);
}
