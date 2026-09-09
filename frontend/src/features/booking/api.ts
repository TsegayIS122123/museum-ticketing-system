import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api-types';
import type { Booking, BookingListResponse } from '@/lib/api-contract';

export type { Booking as BookingResponse, BookingListResponse } from '@/lib/api-contract';
export type BookingStatus = components['schemas']['BookingStatusEnum'];

// BookingCreateRequest (contracts/openapi.yaml): visitor identity comes
// from the authenticated user (request.user) on the backend, never from
// the request body. There is no visitorName/visitorEmail/visitorPhone/
// specialRequests/visitTime field anywhere in the contract -- a caller
// must already be logged in (the OTP verify flow) before this can
// succeed at all. See DateCategoryPicker/BookingSummary/book/page.tsx
// for where the old UI collected these; that "Details" step needs a
// product decision (drop the fields, or insert a login/verify step
// before checkout), not just a type fix.
export type CreateBookingInput = components['schemas']['BookingCreate'];

// POST /bookings/ -- Visitor only (must be logged in/OTP-verified).
export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  return apiClient.post<Booking>('/bookings/', input);
}

// GET /bookings/{id}/ -- the owning visitor or any Staff member.
export async function getBooking(id: string): Promise<Booking> {
  return apiClient.get<Booking>(`/bookings/${id}/`);
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

// POST /bookings/{id}/cancel/ (FR-BOOK-005/006 for a Pending booking;
// also the delete half of editing a still-unpaid AwaitingPayment one --
// see BookingCancelView's own docstring for why it's the same endpoint
// either way).
export async function cancelBooking(id: string): Promise<Booking> {
  return apiClient.post<Booking>(`/bookings/${id}/cancel/`);
}

// One {categoryId, quantity} entry of an UpdateBookingInput's `items`
// list -- same shape the booking wizard's own BookingItemInput uses.
export interface UpdateBookingItemInput {
  categoryId: string;
  quantity: number;
}

// PATCH /bookings/{id}/ -- the owning visitor only, and only while the
// booking is still `awaiting_payment` (services.
// update_awaiting_payment_booking enforces this on the backend). Lets a
// visitor fix her ticket mix and/or visit date before paying, instead of
// cancelling and starting the wizard over. Both fields are optional, but
// at least one is required.
//
// Hand-authored request type, not sourced from `components['schemas']`
// like CreateBookingInput above -- this endpoint doesn't exist in the
// currently-checked-in generated OpenAPI contract yet. Re-run
// `frontend/scripts/generate-types.sh` (after `backend/scripts/
// export_contract.sh`) once the backend's contract export picks up
// `BookingUpdateRequest`, then this can switch over the same way.
export interface UpdateBookingInput {
  items?: UpdateBookingItemInput[];
  visitDate?: string;
}

export async function updateBooking(id: string, input: UpdateBookingInput): Promise<Booking> {
  return apiClient.patch<Booking>(`/bookings/${id}/`, input);
}

// POST /bookings/{id}/reschedule/ -- at most once (FR-BOOK-007).
export async function rescheduleBooking(id: string, newVisitDate: string): Promise<Booking> {
  return apiClient.post<Booking>(`/bookings/${id}/reschedule/`, { newVisitDate });
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
  const dates = await apiClient.get<components['schemas']['DateAvailability'][]>(
    `/availability/?${query.toString()}`
  );
  const match = dates.find((d) => d.date === date);
  // If a date isn't in the list yet, treat it as open (matches backend default).
  return { isOpenForBooking: match ? match.isOpenForBooking : true };
}
