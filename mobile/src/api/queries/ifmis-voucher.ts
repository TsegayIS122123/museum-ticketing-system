import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient } from '@/api/client';

/**
 * IFMIS voucher — the fields the Cashier needs to copy into IFMIS herself
 * at check-in, plus the Document No / Ref No she brings back from IFMIS
 * once it's been keyed.
 *
 * The platform never calls IFMIS (FR-GOV-001). It only prepares the fields
 * and later records the two identifiers the Cashier reports back.
 *
 * Shape matches `Voucher` in the OpenAPI contract (flat, camelCase).
 * `documentNo`/`refNo` are null until `record_ifmis_voucher` sets them;
 * `voucherRecorded` is true only once *both* are set — drive the
 * "voucher pending" badge off it, never off either field individually.
 */
const voucherSchema = z.object({
  documentNo: z.string().nullable(),
  date: z.string().nullable(),
  refNo: z.string().nullable(),
  nameOfPublicBody: z.string(),
  receivedFrom: z.string(),
  amountFigures: z.string(),
  amountWords: z.string(),
  purpose: z.string(),
  voucherRecorded: z.boolean(),
});

export type IfmisVoucher = z.infer<typeof voucherSchema>;

export async function fetchVoucher(bookingId: string): Promise<IfmisVoucher> {
  const res = await apiClient.get(`/bookings/${bookingId}/ifmis-voucher/`);
  return voucherSchema.parse(res.data);
}

export function useVoucher(bookingId: string | null) {
  return useQuery({
    queryKey: ['ifmis-voucher', bookingId],
    queryFn: () => fetchVoucher(bookingId!),
    enabled: !!bookingId,
    staleTime: 30_000,
  });
}

const voucherUpdateSchema = z.object({
  documentNo: z.string().min(1),
  refNo: z.string().min(1),
});

export type VoucherUpdateInput = z.infer<typeof voucherUpdateSchema>;

// PATCH returns the full `Booking` (contract), not the voucher.
const patchedBookingSchema = z.object({
  id: z.string().uuid(),
  reference: z.string(),
  status: z.string(),
});

export type RecordedVoucherBooking = z.infer<typeof patchedBookingSchema>;

export async function updateVoucher(
  bookingId: string,
  input: VoucherUpdateInput
): Promise<RecordedVoucherBooking> {
  const body = voucherUpdateSchema.parse(input);
  const res = await apiClient.patch(`/bookings/${bookingId}/ifmis-voucher/`, body);
  return patchedBookingSchema.parse(res.data);
}

export function useUpdateVoucher() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      bookingId,
      input,
    }: {
      bookingId: string;
      input: VoucherUpdateInput;
    }) => updateVoucher(bookingId, input),
    onSuccess: (_data, { bookingId }) => {
      qc.invalidateQueries({ queryKey: ['ifmis-voucher', bookingId] });
      qc.invalidateQueries({ queryKey: ['booking', bookingId] });
    },
  });
}