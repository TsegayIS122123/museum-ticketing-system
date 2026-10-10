import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient } from '@/api/client';

// ---------- booking lookup ----------
// `GET /bookings/lookup/` returns the contract's `Booking` schema, which is
// camelCase -- the same shape every other Booking-returning endpoint uses.

const bookingLookupSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  status: z.enum(['awaiting_payment', 'pending', 'visited', 'cancelled', 'refunded']),
  visitDate: z.string(),
  bookingType: z.enum(['individual', 'group']).optional(),
  bookedQuantity: z.number().optional(),
  attendedQuantity: z.number().nullable().optional(),
  groupName: z.string().nullable().optional(),
  groupTin: z.string().nullable().optional(),
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
  totalAmountEtb: z.string().optional(),
  // No check-in timestamp exists on the wire: `Booking` carries no such
  // field, so "already checked in" is read from `status === 'visited'`.
});

export type GateBooking = z.infer<typeof bookingLookupSchema>;

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
// `POST /bookings/{id}/check-in/` takes no request body (UAT round 1: the
// Cashier no longer supplies a per-item attended count here -- mismatches go
// through `flag-mismatch` and a Manager's correction instead) and returns
// `CheckInResponse` = `Booking` + a `voucher` object. zod drops the extra
// `voucher` key here; the IFMIS voucher screen reads its own endpoint.

export async function checkInBooking(bookingId: string) {
  const res = await apiClient.post(`/bookings/${bookingId}/check-in/`);
  return bookingLookupSchema.parse(res.data);
}

export function useCheckIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId }: { bookingId: string }) => checkInBooking(bookingId),
    onSuccess: (_data, { bookingId }) => {
      qc.invalidateQueries({ queryKey: ['gate-lookup'] });
      qc.invalidateQueries({ queryKey: ['booking', bookingId] });
    },
  });
}
