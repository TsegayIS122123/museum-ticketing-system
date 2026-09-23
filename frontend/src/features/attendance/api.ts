import { apiClient } from '@/lib/api/client';
import type { Booking, BookingListResponse } from '@/lib/api-contract';

// GET /bookings?flagged=true -- Staff only, but only meaningfully usable
// by a Museum Manager (or Platform Admin), since correcting what shows
// up here (correctBookingCategory/correctBookingCategoryBatch/
// addBookingItem, in '@/features/entrance/api') is Manager-only (UAT
// round 1). Every booking a Cashier has flagged for a headcount/category
// mismatch (POST /bookings/{id}/flag-mismatch/) and that hasn't been
// corrected yet -- flaggedMismatchAt non-null is the entire definition
// of "on this queue" (apps.bookings.services.
// _clear_flagged_mismatch_fields's own docstring: no separate "reviewed"
// flag needed, since a correction clears the flag itself). Ordered by
// the backend: today's visit date first, then oldest-flagged.
export async function getFlaggedBookings(params?: {
  limit?: number;
  offset?: number;
}): Promise<BookingListResponse> {
  const query = new URLSearchParams();
  query.set('flagged', 'true');
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  return apiClient.get<BookingListResponse>(`/bookings/?${query.toString()}`);
}

export type { Booking, BookingListResponse };
