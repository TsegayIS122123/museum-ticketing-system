import { apiClient } from '@/lib/api/client';

export type BookingStatus =
  | 'awaiting_payment'
  | 'pending_approval'
  | 'pending'
  | 'visited'
  | 'cancelled'
  | 'refunded';

export interface BookingResponse {
  id: string;
  reference: string;
  visitorId: string;
  categoryId: string;
  // Bilingual category name *snapshot* taken at booking time -- always
  // present, even if the category has since been renamed or retired.
  categoryNameEn: string;
  categoryNameAm: string;
  visitDate: string;
  bookingType: 'individual' | 'group';
  groupName: string | null;
  // Who a Cashier calls/SMSs to reach this booking's requester. For a
  // group booking this is the number collected at booking time
  // (`groupContactPhone`); for an individual booking there is no
  // separate contact number -- use visitorEmail/visitorPhone instead.
  groupContactPhone: string | null;
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string | null;
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
  totalAmountEtb: string; // decimal string, e.g. "150.00" -- NOT a number
  createdAt: string;
}

export interface BookingListResponse {
  data: BookingResponse[];
  meta: {
    limit: number;
    offset: number;
    total: number;
  };
}

// BookingCreateRequest (contracts/openapi.yaml): visitor identity comes
// from the authenticated user (request.user) on the backend, never from
// the request body. There is no visitorName/visitorEmail/visitorPhone/
// specialRequests/visitTime field anywhere in the contract -- a caller
// must already be logged in (the OTP verify flow) before this can
// succeed at all. See DateCategoryPicker/BookingSummary/book/page.tsx
// for where the old UI collected these; that "Details" step needs a
// product decision (drop the fields, or insert a login/verify step
// before checkout), not just a type fix.
export interface CreateBookingInput {
  visitDate: string;
  categoryId: string;
  quantity: number;
  bookingType: 'individual' | 'group';
  groupName?: string | null;
  groupContactPhone?: string | null;
}

// POST /bookings/ -- Visitor only (must be logged in/OTP-verified).
export async function createBooking(input: CreateBookingInput): Promise<BookingResponse> {
  return apiClient.post<BookingResponse>('/bookings/', input);
}

// GET /bookings/{id}/ -- the owning visitor or any Staff member.
export async function getBooking(id: string): Promise<BookingResponse> {
  return apiClient.get<BookingResponse>(`/bookings/${id}/`);
}

// GET /users/me/bookings/ -- the current visitor's own bookings. Paginated
// envelope, same as every other list endpoint in this API.
export async function getMyBookings(params?: {
  limit?: number;
  offset?: number;
}): Promise<BookingListResponse> {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  const qs = query.toString();
  const response = await apiClient.get<BookingListResponse>(
    `/users/me/bookings/${qs ? `?${qs}` : ''}`
  );
  return response;
}

// POST /bookings/{id}/cancel/ (FR-BOOK-005/006).
export async function cancelBooking(id: string): Promise<BookingResponse> {
  return apiClient.post<BookingResponse>(`/bookings/${id}/cancel/`);
}

// POST /bookings/{id}/reschedule/ -- at most once (FR-BOOK-007).
export async function rescheduleBooking(id: string, newVisitDate: string): Promise<BookingResponse> {
  return apiClient.post<BookingResponse>(`/bookings/${id}/reschedule/`, { newVisitDate });
}

// GET /availability/?from=...&to=... -- both query params are REQUIRED by
// the backend (services.list_date_availability / _parse_required_date
// raises a 400 if either is missing), even though the generated contract
// doesn't document them (same class of drf-spectacular under-documentation
// bug as /reports/summary/'s period param and GET /bookings' filters --
// the view's @extend_schema never declared `parameters=`).
// Response is a plain array, NOT the {data, meta} envelope -- this one
// endpoint isn't paginated on the backend.
export async function checkDateAvailability(date: string): Promise<{ isOpenForBooking: boolean }> {
  const query = new URLSearchParams({ from: date, to: date });
  const dates = await apiClient.get<{ date: string; isOpenForBooking: boolean }[]>(
    `/availability/?${query.toString()}`
  );
  const match = dates.find((d) => d.date === date);
  // If a date isn't in the list yet, treat it as open (matches backend default).
  return { isOpenForBooking: match ? match.isOpenForBooking : true };
}
