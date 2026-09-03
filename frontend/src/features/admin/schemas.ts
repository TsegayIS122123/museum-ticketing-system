import { z } from 'zod';

// StaffCreateRequest (contracts/openapi.yaml) -- Platform Admin only.
export const staffCreateSchema = z.object({
  email: z.string().email('Please enter a valid email address'),
  phone: z.string()
    .regex(/^(\+251|0)?[7-9][0-9]{8}$/, 'Please enter a valid Ethiopian phone number')
    .optional()
    .default(''),
  full_name: z.string()
    .min(2, 'Full name must be at least 2 characters')
    .max(255, 'Full name must be less than 255 characters'),
  role: z.enum(['cashier', 'museum_manager'], {
    errorMap: () => ({ message: 'Please select a valid role' }),
  }),
});

export const staffUpdateSchema = z.object({
  email: z.string().email('Please enter a valid email address').optional(),
  phone: z.string()
    .regex(/^(\+251|0)?[7-9][0-9]{8}$/, 'Please enter a valid Ethiopian phone number')
    .optional(),
  full_name: z.string().min(2).max(255).optional(),
  role: z.enum(['cashier', 'museum_manager']).optional(),
  active: z.boolean().optional(),
});

export type StaffCreateInput = z.infer<typeof staffCreateSchema>;
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;
