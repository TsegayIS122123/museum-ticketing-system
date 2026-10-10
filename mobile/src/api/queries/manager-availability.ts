import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient } from '@/api/client';

// `GET /availability/` returns `DateAvailability` (contract, camelCase); the
// PUT body is `DateAvailabilityUpdate` (`isOpenForBooking`).

const dateSchema = z.object({
  date: z.string(),
  isOpenForBooking: z.boolean(),
  closedByUserId: z.string().uuid().nullable().optional(),
  closedAt: z.string().nullable().optional(),
  closedReason: z.string().nullable().optional(),
});

export type DateAvailability = z.infer<typeof dateSchema>;

export async function fetchRange(from: string, to: string) {
  const res = await apiClient.get('/availability/', { params: { from, to } });
  return z.array(dateSchema).parse(res.data);
}

export function useAvailabilityRange(from: string, to: string) {
  return useQuery({
    queryKey: ['manager-availability', from, to],
    queryFn: () => fetchRange(from, to),
    staleTime: 30_000,
  });
}

export async function setDateOpen(date: string, open: boolean) {
  const res = await apiClient.put(`/availability/${date}/`, {
    isOpenForBooking: open,
  });
  return dateSchema.parse(res.data);
}

export function useSetAvailability() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ date, open }: { date: string; open: boolean }) =>
      setDateOpen(date, open),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['manager-availability'] });
      qc.invalidateQueries({ queryKey: ['availability'] });
    },
  });
}
