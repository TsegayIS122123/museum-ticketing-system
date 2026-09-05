import { apiClient } from '@/lib/api/client';
import type { Booking, CheckInResponse } from '@/lib/api-contract';

// GET /bookings/lookup and POST /bookings/{id}/check-in both return the
// plain `Booking` shape (apps.bookings.serializers.BookingSerializer) --
// there is no separate "lookup" resource on the backend and no
// visitorName/visitorEmail/visitorPhone/visitTime/isCheckedIn/
// checkedInAt/checkedInBy/shortfall/isPartial fields anywhere in the
// contract. "Checked in" is just `status === 'visited'`
// (apps.entrance.services.check_in_booking transitions the booking
// straight to Visited); there is no separate boolean or timestamp for it
// -- `createdAt` is the booking's creation time, not the check-in time,
// and the API has no check-in-timestamp field at all today.
export type BookingLookupResponse = Booking;

// POST /bookings/{id}/check-in's response (CheckInResponseSerializer,
// apps.entrance.serializers) -- the same Booking fields above, plus four
// IFMIS voucher-prep fields the Cashier needs to key this transaction
// into IFMIS herself (the platform never calls IFMIS directly).
export type { CheckInResponse };

// GET /bookings/lookup?reference=... -- Cashier only (FR-TICKET-001,
// FR-TICKET-004). Accepts either a typed reference or a keyboard-wedge
// QR scan through the same field (ADR-007) -- the backend can't tell the
// two apart and doesn't need to.
export async function lookupBooking(reference: string): Promise<BookingLookupResponse> {
  return apiClient.get<BookingLookupResponse>(`/bookings/lookup?reference=${encodeURIComponent(reference)}`);
}

// POST /bookings/{id}/check-in -- Cashier only (FR-TICKET-001 -
// FR-TICKET-003, FR-TICKET-005). `attendedQuantity` may be 0 but must not
// exceed the booking's bookedQuantity (services.check_in_booking enforces
// the upper bound; the serializer only enforces min_value=0).
export async function checkInBooking(bookingId: string, attendedQuantity: number): Promise<CheckInResponse> {
  return apiClient.post<CheckInResponse>(`/bookings/${bookingId}/check-in`, { attendedQuantity });
}

// GET /bookings/{id} -- the owning Visitor or any Staff member. Used here
// to re-fetch a booking (e.g. after check-in) with the plain Booking
// shape rather than CheckInResponse's extra IFMIS fields.
export async function getBooking(id: string): Promise<BookingLookupResponse> {
  return apiClient.get<BookingLookupResponse>(`/bookings/${id}`);
}

// PATCH /bookings/{id}/ifmis-voucher/ -- Cashier only, and only the same
// Cashier who checked this booking in (services.record_ifmis_voucher_
// reference enforces the "same cashier, settable once" rule against the
// specific booking, not just the role). Called after she's actually
// entered the transaction into IFMIS and gotten the real voucher
// reference back. Was entirely missing from the frontend before now --
// there was no way to complete the IFMIS half of the check-in workflow.
export async function recordIfmisVoucherReference(
  bookingId: string,
  voucherReference: string
): Promise<Booking> {
  return apiClient.patch<Booking>(`/bookings/${bookingId}/ifmis-voucher/`, { voucherReference });
}

// PATCH /bookings/{id}/category-correction/ -- Cashier only, and only on
// a Pending booking (apps.bookings.services.correct_booking_category
// enforces both). ID-verification addendum: called when the visitor's ID
// at the gate doesn't match the category they booked under. The backend
// resolves the money side on its own -- an undercharge reopens the
// booking for payment (status becomes 'awaiting_payment' again, with a
// fresh checkoutUrl for just the difference), an overcharge issues a
// refund for the difference and leaves the booking Pending -- so the
// caller only ever needs the returned Booking, never a separate
// success/failure branch for which direction the correction went.
export async function correctBookingCategory(
  bookingId: string,
  categoryId: string
): Promise<Booking> {
  return apiClient.patch<Booking>(`/bookings/${bookingId}/category-correction/`, { categoryId });
}
