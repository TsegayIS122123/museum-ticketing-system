import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient } from '@/api/client';

// ---------- availability ----------

const availabilitySchema = z.object({
  date: z.string(),
  is_open_for_booking: z.boolean(),
  closed_by_user_id: z.string().uuid().nullable().optional(),
  closed_at: z.string().nullable().optional(),
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
  category_id: z.string().uuid(),
  quantity: z.number().int().min(1),
});

const bookingCreateInputSchema = z.object({
  visit_date: z.string(),
  booking_type: z.enum(['individual', 'group']),
  group_name: z.string().optional(),
  group_tin: z.string().optional(),
  items: z.array(bookingItemInputSchema).min(1),
});

export type BookingCreateInput = z.infer<typeof bookingCreateInputSchema>;

const bookingResponseSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  status: z.string(),
  visit_date: z.string(),
  total_amount_etb: z.string(),
  checkout_url: z.string().nullable().optional(),
  items: z.array(z.any()).optional(),
});

export type BookingResponse = z.infer<typeof bookingResponseSchema>;

export async function createBooking(input: BookingCreateInput) {
  const body = bookingCreateInputSchema.parse(input);
  const res = await apiClient.post('/bookings/', body);
  return bookingResponseSchema.parse(res.data);
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
  data: z.array(
    z.object({
      id: z.string().uuid(),
      reference: z.string(),
      status: z.enum(['awaiting_payment', 'pending', 'visited', 'cancelled', 'refunded']),
      visit_date: z.string(),
      total_amount_etb: z.string(),
      booked_quantity: z.number().optional(),
      category_name_en: z.string().optional(),
      category_name_am: z.string().optional(),
      items: z.array(z.any()).optional(),
      created_at: z.string().optional(),
    })
  ),
  meta: z.object({
    limit: z.number(),
    offset: z.number(),
    total: z.number(),
  }),
});

export type MyBooking = z.infer<typeof myBookingsEnvelopeSchema>['data'][0];

export async function fetchMyBookings(): Promise<MyBooking[]> {
  const res = await apiClient.get('/users/me/bookings/');
  const parsed = myBookingsEnvelopeSchema.parse(res.data);
  return parsed.data;
}

export function useMyBookings() {
  return useQuery({
    queryKey: ['my-bookings'],
    queryFn: fetchMyBookings,
    staleTime: 30_000,
  });
}

// ---------- cancel ----------

export async function cancelBooking(id: string) {
  const res = await apiClient.post(`/bookings/${id}/cancel/`);
  return bookingResponseSchema.parse(res.data);
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
  new_visit_date: z.string(),
});

export async function rescheduleBooking(id: string, newVisitDate: string) {
  const body = rescheduleInputSchema.parse({ new_visit_date: newVisitDate });
  const res = await apiClient.post(`/bookings/${id}/reschedule/`, body);
  return bookingResponseSchema.parse(res.data);
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
