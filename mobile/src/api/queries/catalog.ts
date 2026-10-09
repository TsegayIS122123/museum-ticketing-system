import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient } from '@/api/client';

const categorySchema = z.object({
  id: z.string().uuid(),
  name_en: z.string(),
  name_am: z.string(),
  price_etb: z.string(),
  is_free: z.boolean(),
  active: z.boolean(),
});

const categoriesEnvelopeSchema = z.object({
  data: z.array(categorySchema),
  meta: z.object({
    limit: z.number(),
    offset: z.number(),
    total: z.number(),
  }),
});

export type Category = z.infer<typeof categorySchema>;

export async function fetchCategories(): Promise<Category[]> {
  const res = await apiClient.get('/categories/');
  const parsed = categoriesEnvelopeSchema.parse(res.data);
  return parsed.data;
}

export function useCategories() {
  return useQuery({
    queryKey: ['categories'],
    queryFn: fetchCategories,
    staleTime: 5 * 60 * 1000,
  });
}
