import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient } from '@/api/client';

const bookingItemSchema = z
  .object({
    id: z.string().optional(),
    categoryId: z.string().optional(),
    categoryNameEn: z.string().optional(),
    categoryNameAm: z.string().optional(),
    quantity: z.number().optional(),
    unitPriceEtb: z.string().optional(),
    subtotalEtb: z.string().optional(),
  })
  .passthrough(); // tolerate additional fields without failing

// `GET /bookings/{id}/` returns the contract's `Booking` schema -- camelCase.
const bookingSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  status: z.enum(['awaiting_payment', 'pending', 'visited', 'cancelled', 'refunded']),
  visitDate: z.string(),
  totalAmountEtb: z.string(),
  checkoutUrl: z.string().nullable().optional(),
  receiptUrl: z.string().nullable().optional(),
  items: z.array(bookingItemSchema).optional(),
  createdAt: z.string().optional(),
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
