import { useInfiniteQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient } from '@/api/client';

/**
 * Manager refunds oversight -- `GET /refunds/`.
 *
 * `Refund` is camelCase in the contract (contracts/openapi.yaml, the
 * `Refund` schema) and `RefundSerializer`
 * (backend/apps/refunds/serializers.py) emits exactly those keys, so
 * nothing here is cased on assumption. Every field is `readOnly` there:
 * refunds are created by `apps.refunds.services`, never through this
 * serializer, so this client only ever reads them.
 *
 * Response is `PaginatedRefundList` -- the same `{ data, meta: { limit,
 * offset, total } }` envelope as every other list in the API, from
 * `EnvelopeLimitOffsetPagination` (backend/apps/core/pagination.py,
 * default 20, max 100).
 *
 * Ordering is newest-first, from the model's own
 * `Meta.ordering = ["-created_at"]` (backend/apps/refunds/models.py) --
 * read the server order, do not re-sort client-side.
 *
 * Scope note: the view reads a `reason` query param
 * (`services.list_refunds`), which the contract does not document. This
 * client deliberately sends neither it nor any other filter -- the
 * day-one screen is a plain list.
 */

const refundSchema = z.object({
  id: z.string().uuid(),
  bookingId: z.string().uuid(),
  amountEtb: z.string(),
  reason: z.enum([
    'cancellation',
    'partial_shortfall',
    'no_response',
    'category_correction',
  ]),
  status: z.enum(['pending', 'completed', 'failed']),
  chapaRefundReference: z.string().nullable(),
  createdAt: z.string(),
});

export type Refund = z.infer<typeof refundSchema>;
export type RefundReason = Refund['reason'];
export type RefundStatus = Refund['status'];

const refundsEnvelopeSchema = z.object({
  data: z.array(refundSchema),
  meta: z.object({
    limit: z.number(),
    offset: z.number(),
    total: z.number(),
  }),
});

export type RefundsPage = z.infer<typeof refundsEnvelopeSchema>;

export const REFUNDS_PAGE_SIZE = 20;

export async function fetchRefunds(
  params: { limit?: number; offset?: number } = {}
): Promise<RefundsPage> {
  const res = await apiClient.get('/refunds/', { params });
  return refundsEnvelopeSchema.parse(res.data);
}

/**
 * Cursor-paginated rather than a single first page: a plain `limit: 20`
 * query would silently drop every refund past the twentieth with nothing
 * on screen saying so -- the same under-reporting the web page documents
 * for its own stat cards (frontend/src/app/[lang]/staff/refunds/page.tsx).
 * `meta.offset` is the offset that was requested (DRF
 * `LimitOffsetPagination`), so the next page starts at offset plus the
 * rows actually returned.
 */
export function useRefunds(limit = REFUNDS_PAGE_SIZE) {
  return useInfiniteQuery({
    queryKey: ['manager-refunds', limit],
    queryFn: ({ pageParam }) => fetchRefunds({ limit, offset: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last) => {
      const next = last.meta.offset + last.data.length;
      return next < last.meta.total ? next : undefined;
    },
    staleTime: 30_000,
  });
}
