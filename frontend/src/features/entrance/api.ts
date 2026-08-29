import { apiClient } from '@/lib/api/client';

export interface BookingLookupResponse {
  id: string;
  reference: string;
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string;
  visitDate: string;
  visitTime?: string;
  bookedQuantity: number;
  attendedQuantity: number | null;
  categoryNameEn: string;
  categoryNameAm: string;
  totalAmountEtb: number;
  status: 'awaiting_payment' | 'pending_approval' | 'pending' | 'visited' | 'cancelled' | 'refunded';
  isCheckedIn: boolean;
  checkedInAt?: string;
  checkedInBy?: string;
}

export interface CheckInResponse {
  bookingId: string;
  attendedQuantity: number;
  checkedInAt: string;
  status: 'visited';
  shortfall: number;
  isPartial: boolean;
}

// Look up booking by reference (typed or QR scanned)
export async function lookupBooking(reference: string): Promise<BookingLookupResponse> {
  return apiClient.get<BookingLookupResponse>(`/bookings/lookup?reference=${encodeURIComponent(reference)}`);
}

// Check in a booking with attended quantity
export async function checkInBooking(bookingId: string, attendedQuantity: number): Promise<CheckInResponse> {
  return apiClient.post<CheckInResponse>(`/bookings/${bookingId}/check-in`, { attendedQuantity });
}

// Get booking by ID (for re-fetch after check-in)
export async function getBooking(id: string): Promise<BookingLookupResponse> {
  return apiClient.get<BookingLookupResponse>(`/bookings/${id}`);
}
