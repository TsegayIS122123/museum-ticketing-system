import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient } from '@/api/client';

const bookingItemSchema = z.object({
  id: z.string().optional(),
  category_id: z.string().optional(),
  quantity: z.number().optional(),
  unit_price_etb: z.string().optional(),
  subtotal_etb: z.string().optional(),
});

const bookingSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  status: z.enum(['awaiting_payment', 'pending', 'visited', 'cancelled', 'refunded']),
  visit_date: z.string(),
  total_amount_etb: z.string(),
  checkout_url: z.string().nullable().optional(),
  receipt_url: z.string().nullable().optional(),
  items: z.array(bookingItemSchema).optional(),
  created_at: z.string().optional(),
});

export type BookingStatus = z.infer<typeof bookingSchema>['status'];
export type Booking = z.infer<typeof bookingSchema>;

export async function fetchBooking(id: string): Promise<Booking> {
  const res = await apiClient.get(`/bookings/${id}/`);
  return bookingSchema.parse(res.data);
}

/**
 * Poll the booking until its status leaves `awaiting_payment`, or the timeout
 * elapses. Payment confirmation is webhook-driven (FR-PAY-002), so the
 * client never trusts the Chapa redirect — it only trusts the server's
 * `status` field eventually flipping.
 */
export function useBookingPolling(
  bookingId: string | null,
  { enabled, intervalMs = 2000, timeoutMs = 60000 }: {
    enabled: boolean;
    intervalMs?: number;
    timeoutMs?: number;
  }
) {
  return useQuery({
    queryKey: ['booking', bookingId],
    queryFn: () => fetchBooking(bookingId!),
    enabled: !!bookingId && enabled,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      if (status && status !== 'awaiting_payment') return false;
      return intervalMs;
    },
    refetchIntervalInBackground: true,
    retry: 1,
  });
}

export async function fetchBookingOnce(id: string): Promise<Booking> {
  return fetchBooking(id);
}
