import { apiClient } from '@/lib/api-client';
import { SEEDED_CATEGORIES, type Category } from '@/lib/constants/categories';

// For MVP, use seeded data. Later, fetch from API:
// GET /api/v1/categories
export async function getCategories(): Promise<Category[]> {
  // Simulate API delay
  await new Promise(resolve => setTimeout(resolve, 300));
  
  // In production, use:
  // const response = await apiClient.get<{ data: Category[] }>('/categories');
  // return response.data;
  
  return SEEDED_CATEGORIES;
}

export async function getCategory(id: string): Promise<Category | undefined> {
  const categories = await getCategories();
  return categories.find(c => c.id === id);
}
