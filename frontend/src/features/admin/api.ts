import { apiClient } from '@/lib/api/client';
import type { StaffCreateInput, StaffUpdateInput, StaffAccount } from './schemas';

export interface StaffAccountResponse {
  id: string;
  email: string;
  phone: string | null;
  fullName: string;
  role: 'cashier' | 'museum_manager' | 'platform_admin';
  active: boolean;
  lastLogin: string | null;
  createdAt: string;
  updatedAt: string;
}

// Get all staff accounts (Platform Admin only)
export async function getStaffAccounts(): Promise<StaffAccountResponse[]> {
  return apiClient.get<StaffAccountResponse[]>('/admin/staff');
}

// Get a specific staff account (Platform Admin only)
export async function getStaffAccount(id: string): Promise<StaffAccountResponse> {
  return apiClient.get<StaffAccountResponse>(`/admin/staff/${id}`);
}

// Create a new staff account (Platform Admin only)
export async function createStaffAccount(input: StaffCreateInput): Promise<StaffAccountResponse> {
  return apiClient.post<StaffAccountResponse>('/admin/staff', input);
}

// Update a staff account (Platform Admin only)
export async function updateStaffAccount(id: string, input: StaffUpdateInput): Promise<StaffAccountResponse> {
  return apiClient.put<StaffAccountResponse>(`/admin/staff/${id}`, input);
}

// Deactivate a staff account (Platform Admin only)
export async function deactivateStaffAccount(id: string): Promise<void> {
  return apiClient.delete<void>(`/admin/staff/${id}`);
}

// Activate a staff account (Platform Admin only)
export async function activateStaffAccount(id: string): Promise<StaffAccountResponse> {
  return apiClient.patch<StaffAccountResponse>(`/admin/staff/${id}/activate`);
}
