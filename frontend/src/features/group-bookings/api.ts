import { apiClient } from '@/lib/api/client';

// Real backend model (contracts/openapi.yaml): there is no dedicated
// group-booking resource. A group visit is a Booking with
// bookingType: 'group', created via the same POST /bookings every
// individual booking uses, then approved/declined via
// PUT /bookings/{id}/approval. Visitor identity (name/email/phone) is
// never part of this payload -- it comes from the authenticated visitor's
// account (request.user) on the backend.

export type BookingStatus =
  | 'awaiting_payment'
  | 'pending_approval'
  | 'pending'
  | 'visited'
  | 'cancelled'
  | 'refunded';

export interface Booking {
  id: string;
  reference: string;
  visitorId: string;
  categoryId: string;
  visitDate: string;
  bookingType: 'individual' | 'group';
  groupName: string | null;
  bookedQuantity: number;
  attendedQuantity: number | null;
  status: BookingStatus;
  approvalStatus: 'approved' | 'declined' | null;
  rescheduledCount: number;
  noticeSentAt: string | null;
  checkoutUrl: string | null;
  receiptUrl: string | null;
  ifmisVoucherReference: string | null;
  reconciliationId: string | null;
  totalAmountEtb: string; // decimal string
  createdAt: string;
}

export interface BookingListResponse {
  data: Booking[];
  meta: {
    limit: number;
    offset: number;
    total: number;
  };
}

export interface CreateGroupBookingInput {
  visitDate: string;
  categoryId: string;
  quantity: number;
  groupName?: string | null;
  groupContactPhone?: string | null;
}

export interface DecideGroupBookingInput {
  bookingId: string;
  decision: 'approve' | 'decline';
  note?: string | null;
}

// POST /bookings -- Visitor only, with bookingType: 'group'. The visitor
// must already be logged in/verified; the endpoint has no anonymous path.
export async function submitGroupBooking(input: CreateGroupBookingInput): Promise<Booking> {
  return apiClient.post<Booking>('/bookings/', {
    visitDate: input.visitDate,
    categoryId: input.categoryId,
    quantity: input.quantity,
    bookingType: 'group',
    groupName: input.groupName ?? null,
    groupContactPhone: input.groupContactPhone ?? null,
  });
}

// GET /bookings?bookingType=group -- Staff only. There is no separate
// "pending count" endpoint; derive it from meta.total on a filtered call.
export async function getGroupBookings(params?: {
  status?: BookingStatus;
  visitDate?: string;
  limit?: number;
  offset?: number;
}): Promise<BookingListResponse> {
  const query = new URLSearchParams();
  query.set('bookingType', 'group');
  if (params?.status) query.set('status', params.status);
  if (params?.visitDate) query.set('visitDate', params.visitDate);
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  return apiClient.get<BookingListResponse>(`/bookings/?${query.toString()}`);
}

// GET /bookings/{id}/ -- the owning visitor or any Staff member.
export async function getGroupBooking(id: string): Promise<Booking> {
  return apiClient.get<Booking>(`/bookings/${id}/`);
}

// PUT /bookings/{id}/approval/ -- Museum Manager only. Approving moves the
// booking to awaiting_payment and a checkout session is created
// server-side; declining is terminal (status becomes cancelled,
// approvalStatus becomes 'declined'). There is no "count of pending group
// bookings" endpoint -- callers should use getGroupBookings({ status:
// 'pending_approval' }) and read meta.total.
export async function decideGroupBooking(input: DecideGroupBookingInput): Promise<Booking> {
  return apiClient.put<Booking>(`/bookings/${input.bookingId}/approval/`, {
    decision: input.decision,
    note: input.note ?? null,
  });
}
