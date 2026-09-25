import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api-types';
import type { Booking, BookingListResponse } from '@/lib/api-contract';

// Real backend model (contracts/openapi.yaml): there is no dedicated
// group-booking resource. A group visit is a Booking with
// bookingType: 'group', created via the same POST /bookings every
// individual booking uses -- it goes straight to awaiting_payment, same
// as an individual booking, with no Museum-Manager approval step in
// between (DateAvailability, FR-BOOK-008, is the only capacity control).
// Visitor identity (name/email/phone) is never part of this payload --
// it comes from the authenticated visitor's account (request.user) on
// the backend.

export type { Booking, BookingListResponse };
export type BookingStatus = components['schemas']['BookingStatusEnum'];

export interface CreateGroupBookingInput {
  visitDate: string;
  items: { categoryId: string; quantity: number }[];
  groupName: string;
  groupTin: string;
  groupContactPhone?: string | null;
}

// POST /bookings -- Visitor only, with bookingType: 'group'. The visitor
// must already be logged in/verified; the endpoint has no anonymous path.
export async function submitGroupBooking(input: CreateGroupBookingInput): Promise<Booking> {
  const body: components['schemas']['BookingCreate'] = {
    visitDate: input.visitDate,
    // A school group visit can mix categories the same way an
    // individual visitor's booking can (e.g. 25 Student tickets plus 2
    // Adult/Teacher tickets for the accompanying staff, in one booking)
    // -- so this passes through whatever rows the requester built in
    // the form, not a single hard-coded category/quantity pair.
    items: input.items.map((item) => ({ categoryId: item.categoryId, quantity: item.quantity })),
    bookingType: 'group',
    groupName: input.groupName,
    // Required alongside groupName for a group booking -- the
    // institutional payer's TIN, needed for the finance office's IFMIS
    // receipt voucher reconciliation.
    groupTin: input.groupTin,
    groupContactPhone: input.groupContactPhone ?? null,
  };
  return apiClient.post<Booking>('/bookings/', body);
}

// GET /bookings?bookingType=group -- Staff only.
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

// GET /institutions/?tin={tin} -- UAT round 1. The autofill lookup
// GroupVisitRequestForm calls once the TIN field reaches 10 digits;
// `null` means the TIN isn't on file yet (a new institution's first
// booking), not an error. See apps.institutions.services.
// resolve_institution's own docstring for the write-time half of this
// (which institution/typed-name pair actually gets saved, at submit).
export async function lookupInstitutionByTin(
  tin: string
): Promise<{ id: string; name: string; nameAm: string | null; tin: string } | null> {
  const response = await apiClient.get<{
    institution: { id: string; name: string; nameAm: string | null; tin: string } | null;
  }>(`/institutions/?tin=${encodeURIComponent(tin)}`);
  return response.institution;
}

// GET /bookings/{id}/ -- the owning visitor or any Staff member.
export async function getGroupBooking(id: string): Promise<Booking> {
  return apiClient.get<Booking>(`/bookings/${id}/`);
}
