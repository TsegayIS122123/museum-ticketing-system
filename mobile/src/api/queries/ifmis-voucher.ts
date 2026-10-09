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
 */
const voucherSchema = z.object({
  booking_id: z.string().uuid(),
  reference: z.string(),

  // Fields the Cashier copies into IFMIS:
  payer_name: z.string().nullable().optional(),
  purpose: z.string().nullable().optional(),
  amount_figures: z.string().nullable().optional(),
  amount_words_en: z.string().nullable().optional(),
  amount_words_am: z.string().nullable().optional(),
  visit_date: z.string().nullable().optional(),

  // The two identifiers returned by IFMIS:
  document_no: z.string().nullable().optional(),
  ref_no: z.string().nullable().optional(),

  // Metadata about when the voucher was recorded
  recorded_at: z.string().nullable().optional(),
  recorded_by_user_id: z.string().uuid().nullable().optional(),
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
  document_no: z.string().min(1),
  ref_no: z.string().min(1),
});

export type VoucherUpdateInput = z.infer<typeof voucherUpdateSchema>;

export async function updateVoucher(
  bookingId: string,
  input: VoucherUpdateInput
): Promise<IfmisVoucher> {
  const body = voucherUpdateSchema.parse(input);
  const res = await apiClient.patch(`/bookings/${bookingId}/ifmis-voucher/`, body);
  return voucherSchema.parse(res.data);
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
    },
  });
}
