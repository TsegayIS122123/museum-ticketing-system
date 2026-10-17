import { z } from 'zod';
import { ROLES } from '@/constants/config';

const roleEnum = z.enum([
  ROLES.VISITOR,
  ROLES.CASHIER,
  ROLES.MUSEUM_MANAGER,
  ROLES.PLATFORM_ADMIN,
]);

export const userProfileSchema = z.object({
  id: z.string().uuid(),
  email: z.string().email(),
  phone: z.string().nullable().optional(),
  full_name: z.string().nullable().optional(),
  role: roleEnum,
  language_preference: z.enum(['en', 'am']),
  active: z.boolean(),
  email_verified_at: z.string().nullable().optional(),
  phone_verified_at: z.string().nullable().optional(),
  created_at: z.string().optional(),
});

export const authResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  user: userProfileSchema,
});

// django-allauth's headless envelope (/_allauth/app/v1/...). `data.user` is
// the full Account profile (AccountHeadlessAdapter); `data.flows` describes
// what the client may do next (returned on an unauthenticated response); and
// `meta` carries the app's SimpleJWT (access_token / refresh_token) plus the
// `session_token` that continues the email-verification flow.
export const headlessFlowSchema = z.object({
  id: z.string(),
  is_pending: z.boolean().optional(),
});

export const headlessEnvelopeSchema = z.object({
  status: z.number(),
  data: z
    .object({
      user: userProfileSchema.optional(),
      flows: z.array(headlessFlowSchema).optional(),
    })
    .passthrough()
    .optional(),
  meta: z
    .object({
      access_token: z.string().optional(),
      refresh_token: z.string().optional(),
      session_token: z.string().optional(),
      is_authenticated: z.boolean().optional(),
    })
    .passthrough()
    .optional(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
export type HeadlessEnvelope = z.infer<typeof headlessEnvelopeSchema>;
