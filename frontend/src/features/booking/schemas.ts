import { z } from 'zod';

export const bookingStepSchema = z.object({
  step: z.enum(['category', 'datetime', 'details', 'payment']),
});

export const categoryStepSchema = z.object({
  categoryId: z.string().uuid('Please select a valid ticket category'),
  quantity: z.number()
    .int('Quantity must be a whole number')
    .min(1, 'Minimum quantity is 1')
    .max(99, 'Maximum quantity is 99'),
});

export const datetimeStepSchema = z.object({
  visitDate: z.string().date('Please select a valid date'),
  visitTime: z.string().regex(/^([0-9]{1,2}):([0-9]{2})\s?(AM|PM)$/i, 'Please select a valid time'),
});

export const detailsStepSchema = z.object({
  fullName: z.string().min(2, 'Please enter your full name'),
  email: z.string().email('Please enter a valid email address'),
  phone: z.string().min(10, 'Please enter a valid phone number'),
  specialRequests: z.string().optional(),
});

export const bookingCreateSchema = z.object({
  visitDate: z.string().date(),
  categoryId: z.string().uuid(),
  quantity: z.number().int().min(1).max(99),
  bookingType: z.enum(['individual', 'group']),
  groupName: z.string().optional(),
  groupContactPhone: z.string().optional(),
  visitorName: z.string().min(2),
  visitorEmail: z.string().email(),
  visitorPhone: z.string().min(10),
  specialRequests: z.string().optional(),
});

export type BookingStep = z.infer<typeof bookingStepSchema>['step'];
export type CategoryStepInput = z.infer<typeof categoryStepSchema>;
export type DatetimeStepInput = z.infer<typeof datetimeStepSchema>;
export type DetailsStepInput = z.infer<typeof detailsStepSchema>;
export type BookingCreateInput = z.infer<typeof bookingCreateSchema>;
