import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api-types';
import type { StaffAccountResponse } from '@/lib/api-contract';
import type { StaffCreateInput, StaffUpdateInput } from './schemas';

export type { StaffAccountResponse };
export type StaffAccountListResponse = components['schemas']['PaginatedAccountList'];

// GET /admin/staff/ -- Platform Admin only. Paginated envelope (flat
// data array -- see the note in apps/core/pagination.py / the contract's
// Paginated*List schema).
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
//
// Response is typed via StaffAccountResponse (api-contract.ts ->
// components["schemas"]["Account"]) rather than the operation's own
// generated response type, which is a verified drf-spectacular bug: see
// the comment on StaffAccountResponse in api-contract.ts.
export async function createStaffAccount(input: StaffCreateInput): Promise<StaffAccountResponse> {
  return apiClient.post<StaffAccountResponse>('/admin/staff/', input);
}

// PUT /admin/staff/{id}/ -- Platform Admin only. Profile fields and role
// may be changed; email/phone changes invalidate any outstanding password
// setup token without issuing a replacement.
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
