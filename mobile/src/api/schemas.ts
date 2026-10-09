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
  created_at: z.string().optional(),
});

export const authResponseSchema = z.object({
  access_token: z.string(),
  refresh_token: z.string().optional(),
  user: userProfileSchema,
});

export const visitorVerifyStartSchema = z.object({
  verification_id: z.string(),
  otp_expires_in_seconds: z.number(),
});

export type UserProfile = z.infer<typeof userProfileSchema>;
export type AuthResponse = z.infer<typeof authResponseSchema>;
