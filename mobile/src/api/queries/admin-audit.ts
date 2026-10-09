import { useQuery } from '@tanstack/react-query';
import { z } from 'zod';
import { apiClient } from '@/api/client';

const auditEntrySchema = z.object({
  id: z.string().uuid(),
  actor_user_id: z.string().uuid().nullable().optional(),
  action: z.string(),
  entity_type: z.string().optional(),
  entity_id: z.string().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
  created_at: z.string(),
});

export type AuditEntry = z.infer<typeof auditEntrySchema>;

const listSchema = z.object({
  data: z.array(auditEntrySchema),
  meta: z.object({
    limit: z.number(),
    offset: z.number(),
    total: z.number(),
  }),
});

export interface AuditFilters {
  actor?: string;
  action?: string;
  entityType?: string;
  entityId?: string;
  from?: string;
  to?: string;
}

export async function fetchAuditLog(filters: AuditFilters = {}): Promise<AuditEntry[]> {
  const res = await apiClient.get('/admin/audit-log/', { params: filters });
  const parsed = listSchema.parse(res.data);
  return parsed.data;
}

export function useAuditLog(filters: AuditFilters = {}) {
  return useQuery({
    queryKey: ['admin-audit', filters],
    queryFn: () => fetchAuditLog(filters),
    staleTime: 15_000,
  });
}
