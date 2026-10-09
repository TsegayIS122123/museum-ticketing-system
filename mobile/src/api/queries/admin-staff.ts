import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient } from '@/api/client';

const staffSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  full_name: z.string(),
  role: z.enum(['cashier', 'museum_manager', 'platform_admin']),
  active: z.boolean(),
  created_at: z.string().optional(),
});

export type StaffAccount = z.infer<typeof staffSchema>;

const listSchema = z.object({
  data: z.array(staffSchema),
  meta: z.object({
    limit: z.number(),
    offset: z.number(),
    total: z.number(),
  }),
});

export async function fetchStaff(): Promise<StaffAccount[]> {
  const res = await apiClient.get('/admin/staff/');
  const parsed = listSchema.parse(res.data);
  return parsed.data;
}

export function useStaffList() {
  return useQuery({
    queryKey: ['admin-staff'],
    queryFn: fetchStaff,
    staleTime: 30_000,
  });
}

const staffCreateSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1),
  phone: z.string().optional(),
  role: z.enum(['cashier', 'museum_manager']),
  password: z.string().min(6),
});

export type StaffCreateInput = z.infer<typeof staffCreateSchema>;

export async function createStaff(input: StaffCreateInput) {
  const body = staffCreateSchema.parse(input);
  const res = await apiClient.post('/admin/staff/', body);
  return staffSchema.parse(res.data);
}

const staffUpdateSchema = z.object({
  full_name: z.string().min(1).optional(),
  phone: z.string().optional(),
  role: z.enum(['cashier', 'museum_manager', 'platform_admin']).optional(),
  active: z.boolean().optional(),
});

export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;

export async function updateStaff(id: string, input: StaffUpdateInput) {
  const body = staffUpdateSchema.parse(input);
  const res = await apiClient.put(`/admin/staff/${id}/`, body);
  return staffSchema.parse(res.data);
}

export async function deactivateStaff(id: string) {
  await apiClient.delete(`/admin/staff/${id}/`);
}

export function useStaffMutations() {
  const qc = useQueryClient();
  const invalidate = () => {
    qc.invalidateQueries({ queryKey: ['admin-staff'] });
  };

  const create = useMutation({ mutationFn: createStaff, onSuccess: invalidate });
  const update = useMutation({
    mutationFn: ({ id, input }: { id: string; input: StaffUpdateInput }) =>
      updateStaff(id, input),
    onSuccess: invalidate,
  });
  const deactivate = useMutation({ mutationFn: deactivateStaff, onSuccess: invalidate });

  return { create, update, deactivate };
}
