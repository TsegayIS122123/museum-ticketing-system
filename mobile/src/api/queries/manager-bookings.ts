import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient } from '@/api/client';
import { bookingSchema } from './bookings';

/**
 * Manager bookings + category-correction batch.
 *
 * `GET /bookings/` contract ref is `Booking` (single), but the backend
 * paginates every list through `EnvelopeLimitOffsetPagination`
 * (apps/core/pagination.py:16) -- the runtime response is always
 * { data: Booking[], meta: { limit, offset, total } }. The single-Booking
 * ref in the generated contract is an openapi-generator artifact, not a
 * code bug. Response shape below is the runtime envelope.
 *
 * `flagged=true` returns only *currently* flagged bookings: the backend
 * filters `flagged_mismatch_at IS NOT NULL` (apps/bookings/services.py:1182)
 * and every correction entry point nulls the flag fields via
 * `_clear_flagged_mismatch_fields` (services.py:329-344, called at :525,
 * :816, :927). So `isCurrentlyFlagged(b) = b.flaggedMismatchAt != null`.
 *
 * Queue ordering is today-first, then oldest-flagged-first
 * (order_by("_not_today", "flagged_mismatch_at")) -- render server order,
 * do not re-sort client-side.
 */

const managerBookingsEnvelopeSchema = z.object({
  data: z.array(bookingSchema),
  meta: z.object({
    limit: z.number(),
    offset: z.number(),
    total: z.number(),
  }),
});

export type ManagerBookingsPage = z.infer<typeof managerBookingsEnvelopeSchema>;

export type ManagerBookingsFilters = {
  flagged?: boolean;
  status?: 'awaiting_payment' | 'pending' | 'visited' | 'cancelled' | 'refunded';
  visitDate?: string; // ISO YYYY-MM-DD
  bookingType?: 'individual' | 'group';
  limit?: number;
  offset?: number;
};

export async function fetchManagerBookings(
  filters: ManagerBookingsFilters = {}
): Promise<ManagerBookingsPage> {
  const params: Record<string, string | number | boolean> = {};
  if (filters.flagged !== undefined) params.flagged = filters.flagged;
  if (filters.status) params.status = filters.status;
  if (filters.visitDate) params.visitDate = filters.visitDate;
  if (filters.bookingType) params.bookingType = filters.bookingType;
  if (filters.limit !== undefined) params.limit = filters.limit;
  if (filters.offset !== undefined) params.offset = filters.offset;

  const res = await apiClient.get('/bookings/', { params });
  return managerBookingsEnvelopeSchema.parse(res.data);
}

export function useManagerBookings(filters: ManagerBookingsFilters = {}) {
  return useQuery({
    queryKey: ['manager-bookings', filters],
    queryFn: () => fetchManagerBookings(filters),
    staleTime: 30_000,
  });
}

/**
 * A "currently flagged for Manager review" booking. The `categoryCorrectedAt`
 * guard is deliberately NOT included: corrections clear `flaggedMismatchAt`
 * outright, so the two can never disagree on a corrected booking.
 */
export function isCurrentlyFlagged(booking: { flaggedMismatchAt?: string | null }): boolean {
  return !!booking.flaggedMismatchAt;
}

// ---------- batch category correction ----------

/**
 * One op line. `itemId === null` means "add a brand-new line for this
 * category"; a non-null `itemId` means "edit this existing line".
 * Field names copied from `BookingCorrectionOp` in the contract.
 */
const correctionOpSchema = z.object({
  itemId: z.string().uuid().nullable(),
  categoryId: z.string().uuid(),
  quantity: z.number().int().min(1),
});

const batchCorrectionInputSchema = z.object({
  ops: z.array(correctionOpSchema).min(1),
});

export type CorrectionOp = z.infer<typeof correctionOpSchema>;
export type BatchCorrectionInput = z.infer<typeof batchCorrectionInputSchema>;

/**
 * Atomic batch correction. Response is the updated `Booking`. The batch
 * endpoint exists specifically to avoid the 409 the single-item
 * `/category-correction/` endpoint returns on a second undercharging change
 * to the same Pending booking (see `PatchedBookingCategoryCorrectionBatch`
 * in the contract for the full rationale).
 */
export async function applyBatchCorrections(
  bookingId: string,
  input: BatchCorrectionInput
) {
  const body = batchCorrectionInputSchema.parse(input);
  const res = await apiClient.patch(
    `/bookings/${bookingId}/category-corrections/batch/`,
    body
  );
  return bookingSchema.parse(res.data);
}

export function useBatchCorrections() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ bookingId, input }: { bookingId: string; input: BatchCorrectionInput }) =>
      applyBatchCorrections(bookingId, input),
    onSuccess: (_data, { bookingId }) => {
      qc.invalidateQueries({ queryKey: ['manager-bookings'] });
      qc.invalidateQueries({ queryKey: ['booking', bookingId] });
    },
  });
}