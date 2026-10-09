import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
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

export type ManagerCategory = z.infer<typeof categorySchema>;

const listSchema = z.object({
  data: z.array(categorySchema),
  meta: z.object({
    limit: z.number(),
    offset: z.number(),
    total: z.number(),
  }),
});

export async function fetchAllCategories(): Promise<ManagerCategory[]> {
  const res = await apiClient.get('/categories/');
  const parsed = listSchema.parse(res.data);
  return parsed.data;
}

export function useManagerCategories() {
  return useQuery({
    queryKey: ['manager-categories'],
    queryFn: fetchAllCategories,
    staleTime: 30_000,
  });
}

const categoryInputSchema = z.object({
  name_en: z.string().min(1),
  name_am: z.string().min(1),
  price_etb: z.string(),
  is_free: z.boolean().optional(),
});

export type CategoryInput = z.infer<typeof categoryInputSchema>;

export async function createCategory(input: CategoryInput) {
  const body = categoryInputSchema.parse(input);
  const res = await apiClient.post('/categories/', body);
  return categorySchema.parse(res.data);
}

export async function updateCategory(id: string, input: CategoryInput) {
  const body = categoryInputSchema.parse(input);
  const res = await apiClient.put(`/categories/${id}/`, body);
  return categorySchema.parse(res.data);
}

export async function retireCategory(id: string) {
  await apiClient.delete(`/categories/${id}/`);
}

export function useCategoryMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['manager-categories'] });
    qc.invalidateQueries({ queryKey: ['categories'] });
  };

  const create = useMutation({ mutationFn: createCategory, onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: CategoryInput }) =>
      updateCategory(id, input),
    onSuccess: invalidate,
  });
  const retire = useMutation({ mutationFn: retireCategory, onSuccess: invalidate });

  return { create, update, retire };
}
