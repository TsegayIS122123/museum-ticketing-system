import { apiClient } from '@/lib/api/client';

export interface GroupBookingRequest {
  id: string;
  organizationName: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  visitDate: string;
  visitTime: string;
  groupSize: number;
  category: string;
  specialRequests?: string;
  status: 'pending' | 'approved' | 'declined';
  submittedAt: string;
  approvedBy?: string;
  approvedAt?: string;
  declinedReason?: string;
}

export interface CreateGroupBookingInput {
  organizationName: string;
  contactPerson: string;
  contactPhone: string;
  contactEmail: string;
  visitDate: string;
  visitTime: string;
  groupSize: number;
  category: string;
  specialRequests?: string;
}

export interface ApproveGroupBookingInput {
  bookingId: string;
  decision: 'approve' | 'decline';
  note?: string;
}

// Submit a group/school visit request
export async function submitGroupBooking(input: CreateGroupBookingInput): Promise<GroupBookingRequest> {
  return apiClient.post<GroupBookingRequest>('/group-bookings', input);
}

// Get all group booking requests (Manager only)
export async function getGroupBookings(): Promise<GroupBookingRequest[]> {
  return apiClient.get<GroupBookingRequest[]>('/group-bookings');
}

// Get a specific group booking request
export async function getGroupBooking(id: string): Promise<GroupBookingRequest> {
  return apiClient.get<GroupBookingRequest>(`/group-bookings/${id}`);
}

// Approve or decline a group booking (Manager only)
export async function decideGroupBooking(input: ApproveGroupBookingInput): Promise<GroupBookingRequest> {
  return apiClient.put<GroupBookingRequest>(`/group-bookings/${input.bookingId}/decision`, input);
}

// Get pending group bookings count
export async function getPendingGroupBookingsCount(): Promise<{ count: number }> {
  return apiClient.get<{ count: number }>('/group-bookings/pending/count');
}
