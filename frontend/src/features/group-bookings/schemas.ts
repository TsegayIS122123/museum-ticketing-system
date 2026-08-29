import { z } from 'zod';

export const groupVisitRequestSchema = z.object({
  organizationName: z.string()
    .min(2, 'Organization/School name is required')
    .max(100, 'Organization name is too long'),
  contactPerson: z.string()
    .min(2, 'Contact person name is required')
    .max(50, 'Contact person name is too long'),
  contactPhone: z.string()
    .min(10, 'Please enter a valid phone number')
    .regex(/^(\+251|0)?[7-9][0-9]{8}$/, 'Please enter a valid Ethiopian phone number'),
  contactEmail: z.string()
    .email('Please enter a valid email address'),
  visitDate: z.string()
    .date('Please select a valid date')
    .refine((date) => new Date(date) >= new Date(), 'Visit date must be in the future'),
  visitTime: z.string()
    .regex(/^([0-9]{1,2}):([0-9]{2})\s?(AM|PM)$/i, 'Please select a valid time'),
  groupSize: z.number()
    .int('Group size must be a whole number')
    .min(10, 'Minimum group size is 10')
    .max(200, 'Maximum group size is 200'),
  category: z.enum(['student', 'adult_teacher', 'foreign_resident', 'non_resident', 'exempt']),
  specialRequests: z.string()
    .max(500, 'Special requests are too long')
    .optional(),
});

export type GroupVisitRequestInput = z.infer<typeof groupVisitRequestSchema>;

export const groupBookingApprovalSchema = z.object({
  bookingId: z.string().uuid(),
  decision: z.enum(['approve', 'decline']),
  note: z.string().optional(),
});

export type GroupBookingApprovalInput = z.infer<typeof groupBookingApprovalSchema>;
