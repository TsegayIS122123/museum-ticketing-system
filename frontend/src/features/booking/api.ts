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

// Mock mode - set to false when backend is ready
const USE_MOCK = true;

// Store mock bookings
let mockBookings: any[] = [];

// Generate booking reference
function generateReference(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = 'BK-';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// Create a new booking
export async function createBooking(input: CreateBookingInput): Promise<BookingResponse> {
  if (USE_MOCK) {
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const newBooking = {
      id: 'mock-booking-' + Date.now(),
      reference: generateReference(),
      visitorId: 'mock-visitor-1',
      categoryId: input.categoryId,
      visitDate: input.visitDate,
      bookingType: input.bookingType,
      groupName: input.groupName || null,
      bookedQuantity: input.quantity,
      attendedQuantity: null,
      status: 'pending' as const,
      approvalStatus: null,
      rescheduledCount: 0,
      noticeSentAt: null,
      checkoutUrl: null,
      receiptUrl: null,
      totalAmountEtb: input.quantity * 100, // Mock calculation
      createdAt: new Date().toISOString(),
    };
    
    mockBookings.push(newBooking);
    return newBooking;
  }
  return apiClient.post<BookingResponse>('/bookings', input);
}

// Get booking by ID
export async function getBooking(id: string): Promise<BookingResponse> {
  if (USE_MOCK) {
    await new Promise(resolve => setTimeout(resolve, 500));
    const booking = mockBookings.find(b => b.id === id);
    if (booking) {
      return booking;
    }
    // Return a mock booking if not found
    return {
      id: id,
      reference: generateReference(),
      visitorId: 'mock-visitor-1',
      categoryId: 'mock-category-1',
      visitDate: new Date().toISOString().split('T')[0],
      bookingType: 'individual',
      groupName: null,
      bookedQuantity: 2,
      attendedQuantity: null,
      status: 'pending',
      approvalStatus: null,
      rescheduledCount: 0,
      noticeSentAt: null,
      checkoutUrl: null,
      receiptUrl: null,
      totalAmountEtb: 200,
      createdAt: new Date().toISOString(),
    };
  }
  return apiClient.get<BookingResponse>(`/bookings/${id}`);
}

// Get all bookings for current visitor
export async function getMyBookings(): Promise<BookingResponse[]> {
  if (USE_MOCK) {
    await new Promise(resolve => setTimeout(resolve, 500));
    // Return mock bookings if we have them, otherwise return sample data
    if (mockBookings.length > 0) {
      return mockBookings;
    }
    // Sample mock bookings
    return [
      {
        id: 'mock-booking-1',
        reference: 'BK-MOCK-001',
        visitorId: 'mock-visitor-1',
        categoryId: 'mock-category-1',
        visitDate: new Date(Date.now() + 86400000 * 7).toISOString().split('T')[0],
        bookingType: 'individual',
        groupName: null,
        bookedQuantity: 2,
        attendedQuantity: null,
        status: 'pending',
        approvalStatus: null,
        rescheduledCount: 0,
        noticeSentAt: null,
        checkoutUrl: null,
        receiptUrl: null,
        totalAmountEtb: 200,
        createdAt: new Date().toISOString(),
      },
      {
        id: 'mock-booking-2',
        reference: 'BK-MOCK-002',
        visitorId: 'mock-visitor-1',
        categoryId: 'mock-category-2',
        visitDate: new Date(Date.now() - 86400000 * 5).toISOString().split('T')[0],
        bookingType: 'individual',
        groupName: null,
        bookedQuantity: 1,
        attendedQuantity: 1,
        status: 'visited',
        approvalStatus: null,
        rescheduledCount: 0,
        noticeSentAt: null,
        checkoutUrl: null,
        receiptUrl: null,
        totalAmountEtb: 100,
        createdAt: new Date(Date.now() - 86400000 * 10).toISOString(),
      },
    ];
  }
  return apiClient.get<BookingResponse[]>('/users/me/bookings');
}

// Cancel a booking (only if Pending)
export async function cancelBooking(id: string): Promise<BookingResponse> {
  if (USE_MOCK) {
    await new Promise(resolve => setTimeout(resolve, 800));
    const booking = mockBookings.find(b => b.id === id);
    if (booking) {
      booking.status = 'cancelled';
      return booking;
    }
    throw new Error('Booking not found');
  }
  return apiClient.post<BookingResponse>(`/bookings/${id}/cancel`);
}

// Reschedule a booking (at most once)
export async function rescheduleBooking(id: string, newVisitDate: string): Promise<BookingResponse> {
  if (USE_MOCK) {
    await new Promise(resolve => setTimeout(resolve, 800));
    const booking = mockBookings.find(b => b.id === id);
    if (booking) {
      booking.visitDate = newVisitDate;
      booking.rescheduledCount = (booking.rescheduledCount || 0) + 1;
      return booking;
    }
    throw new Error('Booking not found');
  }
  return apiClient.post<BookingResponse>(`/bookings/${id}/reschedule`, { newVisitDate });
}

// Check booking availability for a date
export async function checkDateAvailability(date: string): Promise<{ isOpenForBooking: boolean }> {
  if (USE_MOCK) {
    await new Promise(resolve => setTimeout(resolve, 300));
    // All dates are open in mock mode
    return { isOpenForBooking: true };
  }
  return apiClient.get<{ isOpenForBooking: boolean }>(`/availability/${date}`);
}
