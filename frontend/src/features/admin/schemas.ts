import { z } from 'zod';

export const staffAccountSchema = z.object({
  id: z.string().uuid().optional(),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string()
    .regex(/^(\+251|0)?[7-9][0-9]{8}$/, 'Please enter a valid Ethiopian phone number')
    .optional(),
  fullName: z.string()
    .min(2, 'Full name must be at least 2 characters')
    .max(50, 'Full name must be less than 50 characters'),
  role: z.enum(['cashier', 'museum_manager'], {
    errorMap: () => ({ message: 'Please select a valid role' }),
  }),
  active: z.boolean().default(true),
});

export const staffCreateSchema = staffAccountSchema.omit({ id: true, active: true });
export const staffUpdateSchema = staffAccountSchema.partial();

export type StaffAccount = z.infer<typeof staffAccountSchema>;
export type StaffCreateInput = z.infer<typeof staffCreateSchema>;
export type StaffUpdateInput = z.infer<typeof staffUpdateSchema>;
