import { apiClient } from '@/lib/api/client';
import { SEEDED_CATEGORIES, type Category } from '@/lib/constants/categories';
import type { CategoryCreateInput, CategoryUpdateInput } from './schemas';

// Get all categories (public - active only)
export async function getCategories(): Promise<Category[]> {
  // In production, use:
  // const response = await apiClient.get<{ data: Category[] }>('/categories');
  // return response.data;
  
  // For MVP, use seeded data with a delay
  await new Promise(resolve => setTimeout(resolve, 300));
  return SEEDED_CATEGORIES;
}

// Get all categories including inactive (Manager only)
export async function getAllCategories(): Promise<Category[]> {
  return apiClient.get<Category[]>('/categories/all');
}

// Get a single category
export async function getCategory(id: string): Promise<Category> {
  return apiClient.get<Category>(`/categories/${id}`);
}

// Create a new category (Manager only)
export async function createCategory(input: CategoryCreateInput): Promise<Category> {
  return apiClient.post<Category>('/categories', input);
}

// Update a category (Manager only)
export async function updateCategory(id: string, input: CategoryUpdateInput): Promise<Category> {
  return apiClient.put<Category>(`/categories/${id}`, input);
}

// Retire a category (Manager only)
export async function retireCategory(id: string): Promise<void> {
  return apiClient.delete<void>(`/categories/${id}`);
}

// Activate a category (Manager only)
export async function activateCategory(id: string): Promise<Category> {
  return apiClient.patch<Category>(`/categories/${id}/activate`);
}
