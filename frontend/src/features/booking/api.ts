import { apiClient } from '@/lib/api/client';

export interface BookingResponse {
  id: string;
  reference: string;
  visitorId: string;
  categoryId: string;
  visitDate: string;
  bookingType: 'individual' | 'group';
  groupName: string | null;
  bookedQuantity: number;
  attendedQuantity: number | null;
  status: 'awaiting_payment' | 'pending_approval' | 'pending' | 'visited' | 'cancelled' | 'refunded';
  approvalStatus: 'pending' | 'approved' | 'declined' | null;
  rescheduledCount: number;
  noticeSentAt: string | null;
  checkoutUrl: string | null;
  receiptUrl: string | null;
  totalAmountEtb: number;
  createdAt: string;
}

export interface CreateBookingInput {
  visitDate: string;
  categoryId: string;
  quantity: number;
  bookingType: 'individual' | 'group';
  groupName?: string;
  groupContactPhone?: string;
  visitorName: string;
  visitorEmail: string;
  visitorPhone: string;
  specialRequests?: string;
}

// Create a new booking
export async function createBooking(input: CreateBookingInput): Promise<BookingResponse> {
  return apiClient.post<BookingResponse>('/bookings', input);
}

// Get booking by ID
export async function getBooking(id: string): Promise<BookingResponse> {
  return apiClient.get<BookingResponse>(`/bookings/${id}`);
}

// Get all bookings for current visitor
export async function getMyBookings(): Promise<BookingResponse[]> {
  return apiClient.get<BookingResponse[]>('/users/me/bookings');
}

// Cancel a booking (only if Pending)
export async function cancelBooking(id: string): Promise<BookingResponse> {
  return apiClient.post<BookingResponse>(`/bookings/${id}/cancel`);
}

// Reschedule a booking (at most once)
export async function rescheduleBooking(id: string, newVisitDate: string): Promise<BookingResponse> {
  return apiClient.post<BookingResponse>(`/bookings/${id}/reschedule`, { newVisitDate });
}

// Check booking availability for a date
export async function checkDateAvailability(date: string): Promise<{ isOpenForBooking: boolean }> {
  return apiClient.get<{ isOpenForBooking: boolean }>(`/availability/${date}`);
}
