import { apiClient } from '@/lib/api/client';
import type { StaffCreateInput, StaffUpdateInput } from './schemas';

// Real backend shape (contracts/openapi.yaml -- Account). Snake_case,
// same as everywhere else Account appears (GET /users/me/, AuthResponse).
export interface StaffAccountResponse {
  id: string;
  email: string;
  phone: string | null;
  full_name: string;
  role: 'visitor' | 'cashier' | 'museum_manager' | 'platform_admin';
  language_preference: 'en' | 'am';
  active: boolean;
  created_at: string;
}

export interface StaffAccountListResponse {
  data: StaffAccountResponse[];
  meta: {
    limit: number;
    offset: number;
    total: number;
  };
}

// GET /admin/staff/ -- Platform Admin only. Paginated envelope (flat
// data array -- see the note in src/lib/api-types.ts / the contract's
// Paginated*List double-array bug, which is a drf-spectacular
// schema-generation artifact, not the real runtime shape).
export async function getStaffAccounts(params?: {
  limit?: number;
  offset?: number;
}): Promise<StaffAccountListResponse> {
  const query = new URLSearchParams();
  if (params?.limit) query.set('limit', String(params.limit));
  if (params?.offset) query.set('offset', String(params.offset));
  const qs = query.toString();
  return apiClient.get<StaffAccountListResponse>(`/admin/staff/${qs ? `?${qs}` : ''}`);
}

// There is no GET /admin/staff/{id}/ -- Document 04 has no
// single-staff-account retrieve endpoint, list only (mirrors
// CategoryDetailView's own "no GET" design). Deliberately not exported;
// callers should find the account in an already-fetched list.

// POST /admin/staff/ -- Platform Admin only. No password field: the
// backend provisions the account with no usable password and emails a
// set-password link (reuses the forgot-password flow).
export async function createStaffAccount(input: StaffCreateInput): Promise<StaffAccountResponse> {
  return apiClient.post<StaffAccountResponse>('/admin/staff/', input);
}

// PUT /admin/staff/{id}/ -- Platform Admin only. StaffUpdateRequest only
// ever accepts `role` and/or `active` -- email/phone/full_name cannot be
// changed through this endpoint at all (Sec 4.3: an account may only
// ever edit its own contact fields via PUT /users/me/, never have them
// edited by an admin). Used for both role changes and the
// activate/deactivate toggle below.
export async function updateStaffAccount(id: string, input: StaffUpdateInput): Promise<StaffAccountResponse> {
  return apiClient.put<StaffAccountResponse>(`/admin/staff/${id}/`, input);
}

// DELETE /admin/staff/{id}/ -- Platform Admin only. This deactivates the
// account (services.deactivate_staff_account), it does not delete the row.
export async function deactivateStaffAccount(id: string): Promise<void> {
  return apiClient.delete<void>(`/admin/staff/${id}/`);
}

// Reactivating uses the same PUT endpoint as role changes -- there is no
// separate "activate" route (the earlier PATCH .../activate never
// existed on the backend).
export async function activateStaffAccount(id: string): Promise<StaffAccountResponse> {
  return apiClient.put<StaffAccountResponse>(`/admin/staff/${id}/`, { active: true });
}
