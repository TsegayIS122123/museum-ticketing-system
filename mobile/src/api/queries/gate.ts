import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient } from '@/api/client';

// ---------- booking lookup ----------

const bookingLookupSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  status: z.enum(['awaiting_payment', 'pending', 'visited', 'cancelled', 'refunded']),
  visit_date: z.string(),
  booking_type: z.enum(['individual', 'group']).optional(),
  booked_quantity: z.number().optional(),
  attended_quantity: z.number().nullable().optional(),
  group_name: z.string().nullable().optional(),
  group_tin: z.string().nullable().optional(),
  items: z
    .array(
      z.object({
        id: z.string().optional(),
        categoryId: z.string().optional(),
        categoryNameEn: z.string().optional(),
        categoryNameAm: z.string().optional(),
        quantity: z.number().optional(),
        attendedQuantity: z.number().nullable().optional(),
      })
    )
    .optional(),
  total_amount_etb: z.string().optional(),
  checked_in_at: z.string().nullable().optional(),
});

export type GateBooking = z.infer<typeof bookingLookupSchema>;

/** Shape returned by /bookings/lookup/ — check the contract once for the exact keys. */
export async function lookupBooking(reference: string): Promise<GateBooking> {
  const res = await apiClient.get('/bookings/lookup/', { params: { reference } });
  return bookingLookupSchema.parse(res.data);
}

export function useBookingLookup(reference: string | null) {
  return useQuery({
    queryKey: ['gate-lookup', reference],
    queryFn: () => lookupBooking(reference!),
    enabled: !!reference,
    retry: 0,
  });
}

// ---------- check-in ----------

const checkInInputSchema = z.object({
  attended_quantity: z.number().int().min(0),
});

export async function checkInBooking(bookingId: string, attendedQuantity: number) {
  const body = checkInInputSchema.parse({ attended_quantity: attendedQuantity });
  const res = await apiClient.post(`/bookings/${bookingId}/check-in/`, body);
  return bookingLookupSchema.parse(res.data);
}

export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, attendedQuantity }: { bookingId: string; attendedQuantity: number }) =>
      checkInBooking(bookingId, attendedQuantity),
    onSuccess: (_data, { bookingId }) => {
      qc.invalidateQueries({ queryKey: ['gate-lookup'] });
      qc.invalidateQueries({ queryKey: ['booking', bookingId] });
    },
  });
}
