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
