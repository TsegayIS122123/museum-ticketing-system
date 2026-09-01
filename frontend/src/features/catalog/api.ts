import { apiClient } from '@/lib/api/client';
import type { components } from '@/lib/api-types';
import type { Category, CategoryCreateInput, CategoryUpdateInput } from './schemas';

export type CategoryListResponse = components['schemas']['PaginatedCategoryList'];

// GET /categories/ -- public, no auth. Active-only by default
// (services.list_active_categories on the backend). Pass
// `includeInactive: true` for the Museum Manager-only `?active=all`
// variant (services.list_all_categories_for_manager) that also returns
// retired categories -- silently falls back to active-only for anyone
// who isn't an authenticated Museum Manager, so it's always safe to
// pass from a page a non-Manager could theoretically land on.
export async function getCategories(options?: { includeInactive?: boolean }): Promise<Category[]> {
  const qs = options?.includeInactive ? '?active=all' : '';
  const response = await apiClient.get<CategoryListResponse>(`/categories/${qs}`);
  return response.data;
}

// POST /categories/ -- Museum Manager only.
export async function createCategory(input: CategoryCreateInput): Promise<Category> {
  return apiClient.post<Category>('/categories/', input);
}

// PUT /categories/{id}/ -- Museum Manager only. Every field optional;
// used for both price/name edits and for `active` toggles.
export async function updateCategory(id: string, input: CategoryUpdateInput): Promise<Category> {
  return apiClient.put<Category>(`/categories/${id}/`, input);
}

// DELETE /categories/{id}/ -- Museum Manager only. This is a soft
// "retire" (services.retire_category sets active=false), never a hard
// delete -- existing bookings keep referencing the row.
export async function retireCategory(id: string): Promise<void> {
  return apiClient.delete<void>(`/categories/${id}/`);
}

// PUT /categories/{id}/ with { active: true }. Reactivates a retired
// category. Pair with `getCategories({ includeInactive: true })` (a
// Museum Manager-only call) to find the id of a category retired in an
// earlier session -- before that backend change, this only worked if
// the caller already had the id in hand from before it was retired.
export async function activateCategory(id: string): Promise<Category> {
  return apiClient.put<Category>(`/categories/${id}/`, { active: true });
}
