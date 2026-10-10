import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient } from '@/api/client';

// ---------- availability ----------

const availabilitySchema = z.object({
  date: z.string(),
  isOpenForBooking: z.boolean(),
  closedByUserId: z.string().uuid().nullable().optional(),
  closedAt: z.string().nullable().optional(),
});

export type DateAvailability = z.infer<typeof availabilitySchema>;

export async function fetchAvailability(from: string, to: string) {
  const res = await apiClient.get('/availability/', { params: { from, to } });
  return z.array(availabilitySchema).parse(res.data);
}

export function useAvailability(from: string, to: string, enabled = true) {
  return useQuery({
    queryKey: ['availability', from, to],
    queryFn: () => fetchAvailability(from, to),
    enabled: enabled && !!from && !!to,
    staleTime: 60_000,
  });
}

// ---------- booking creation ----------

const bookingItemInputSchema = z.object({
  categoryId: z.string().uuid(),
  quantity: z.number().int().min(1),
});

const bookingCreateInputSchema = z.object({
  visitDate: z.string(),
  bookingType: z.enum(['individual', 'group']),
  groupName: z.string().optional(),
  groupContactPhone: z.string().optional(),
  groupTin: z.string().optional(),
  items: z.array(bookingItemInputSchema).min(1),
});

export type BookingCreateInput = z.infer<typeof bookingCreateInputSchema>;

const bookingItemSchema = z.object({
  id: z.string().uuid(),
  categoryId: z.string().uuid(),
  categoryNameEn: z.string(),
  categoryNameAm: z.string(),
  quantity: z.number().int(),
  attendedQuantity: z.number().int().nullable(),
  unitPriceEtb: z.string(),
  subtotalEtb: z.string(),
});

export const bookingSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  status: z.enum(['awaiting_payment', 'pending', 'visited', 'cancelled', 'refunded']),
  visitorId: z.string().uuid().optional(),
  visitDate: z.string(),
  bookingType: z.enum(['individual', 'group']),
  groupName: z.string().nullable().optional(),
  groupContactPhone: z.string().nullable().optional(),
  groupTin: z.string().nullable().optional(),
  institutionId: z.string().uuid().nullable().optional(),
  visitorName: z.string().nullable().optional(),
  visitorEmail: z.string().nullable().optional(),
  visitorPhone: z.string().nullable().optional(),
  bookedQuantity: z.number().int(),
  attendedQuantity: z.number().int().nullable().optional(),
  rescheduledCount: z.number().int().optional(),
  categoryCorrectedAt: z.string().nullable().optional(),
  flaggedMismatchAt: z.string().nullable().optional(),
  flaggedMismatchByUserId: z.string().uuid().nullable().optional(),
  flaggedMismatchNote: z.string().nullable().optional(),
  noticeSentAt: z.string().nullable().optional(),
  checkoutUrl: z.string().nullable().optional(),
  receiptUrl: z.string().nullable().optional(),
  ifmisDocumentNo: z.string().nullable().optional(),
  ifmisVoucherReference: z.string().nullable().optional(),
  reconciliationId: z.string().uuid().nullable().optional(),
  totalAmountEtb: z.string(),
  createdAt: z.string().optional(),
  items: z.array(bookingItemSchema),
});

export type BookingResponse = z.infer<typeof bookingSchema>;

export async function createBooking(input: BookingCreateInput) {
  const body = bookingCreateInputSchema.parse(input);
  const res = await apiClient.post('/bookings/', body);
  return bookingSchema.parse(res.data);
}

export function useCreateBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: createBooking,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-bookings'] });
    },
  });
}

// ---------- institution (TIN) lookup ----------

const institutionSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  tin: z.string(),
});

export async function lookupInstitution(tin: string) {
  const res = await apiClient.get('/institutions/', { params: { tin } });
  return institutionSchema.parse(res.data);
}

// ---------- my bookings (Visitor list) ----------

const myBookingsEnvelopeSchema = z.object({
  data: z.array(bookingSchema),
  meta: z.object({
    limit: z.number(),
    offset: z.number(),
    total: z.number(),
  }),
});

export type MyBooking = z.infer<typeof bookingSchema>;

export async function fetchMyBookings(): Promise<MyBooking[]> {
  const res = await apiClient.get('/users/me/bookings/');
  const parsed = myBookingsEnvelopeSchema.parse(res.data);
  return parsed.data;
}

export function useMyBookings() {
  return useQuery({
    queryKey: ['my-bookings'],
    queryFn: async () => {
      const bookings = await fetchMyBookings();
      // Best-effort cache; never block the UI
      mirrorMyBookingsToCache(bookings).catch(() => {});
      return bookings;
    },
    staleTime: 30_000,
  });
}

// ---------- cancel ----------

export async function cancelBooking(id: string) {
  const res = await apiClient.post(`/bookings/${id}/cancel/`);
  return bookingSchema.parse(res.data);
}

export function useCancelBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: cancelBooking,
    onSuccess: (_data, id) => {
      qc.invalidateQueries({ queryKey: ['my-bookings'] });
      qc.invalidateQueries({ queryKey: ['booking', id] });
    },
  });
}

// ---------- reschedule ----------

const rescheduleInputSchema = z.object({
  newVisitDate: z.string(),
});

export async function rescheduleBooking(id: string, newVisitDate: string) {
  const body = rescheduleInputSchema.parse({ newVisitDate });
  const res = await apiClient.post(`/bookings/${id}/reschedule/`, body);
  return bookingSchema.parse(res.data);
}

export function useRescheduleBooking() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, newVisitDate }: { id: string; newVisitDate: string }) =>
      rescheduleBooking(id, newVisitDate),
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: ['my-bookings'] });
      qc.invalidateQueries({ queryKey: ['booking', id] });
    },
  });
}

// ---------- offline cache mirroring ----------

/**
 * Called after every successful read of the visitor's own bookings.
 * Only `pending` bookings are cached (see database/tickets.ts).
 */
export async function mirrorMyBookingsToCache(bookings: MyBooking[]): Promise<void> {
  const { cacheTicket, purgeExpiredTickets } = await import('@/database/tickets');
  await purgeExpiredTickets();
  for (const b of bookings) {
    const firstItem = b.items?.[0];
    await cacheTicket({
      reference: b.reference,
      bookingId: b.id,
      status: b.status,
      visitDate: b.visitDate,
      categoryNameEn: firstItem?.categoryNameEn ?? null,
      categoryNameAm: firstItem?.categoryNameAm ?? null,
      quantity: b.bookedQuantity ?? firstItem?.quantity ?? null,
      totalEtb: b.totalAmountEtb,
      payload: b,
    });
  }
}

export async function mirrorSingleBookingToCache(booking: {
  id: string;
  reference: string;
  status: string;
  visitDate: string;
  totalAmountEtb: string;
  items?: Array<{ categoryNameEn?: string; categoryNameAm?: string; quantity?: number }>;
}): Promise<void> {
  const { cacheTicket } = await import('@/database/tickets');
  const firstItem = booking.items?.[0];
  await cacheTicket({
    reference: booking.reference,
    bookingId: booking.id,
    status: booking.status,
    visitDate: booking.visitDate,
    categoryNameEn: firstItem?.categoryNameEn ?? null,
    categoryNameAm: firstItem?.categoryNameAm ?? null,
    quantity: firstItem?.quantity ?? null,
    totalEtb: booking.totalAmountEtb,
    payload: booking,
  });
}