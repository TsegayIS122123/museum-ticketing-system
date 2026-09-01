import { z } from 'zod';

// Real BookingCreateRequest fields for a group booking (contracts/
// openapi.yaml). There is no organizationName/contactPerson/
// contactEmail/visitTime/category(enum)/specialRequests on the backend
// -- visitor identity comes from the authenticated session, and there's
// no time-of-day concept at all. groupName/groupContactPhone are both
// genuinely optional on the backend.
export const groupVisitRequestSchema = z.object({
  categoryId: z.string().min(1, 'Please select a ticket category'),
  visitDate: z.string()
    .refine((date) => new Date(date) >= new Date(new Date().toDateString()), 'Visit date must be today or later'),
  quantity: z.number()
    .int('Group size must be a whole number')
    .min(1, 'Group size must be at least 1'),
  groupName: z.string().max(100, 'Group name is too long').optional(),
  groupContactPhone: z.string()
    .regex(/^(\+251|0)?[7-9][0-9]{8}$/, 'Please enter a valid Ethiopian phone number')
    .optional()
    .or(z.literal('')),
});

export type GroupVisitRequestInput = z.infer<typeof groupVisitRequestSchema>;

export const groupBookingApprovalSchema = z.object({
  bookingId: z.string().uuid(),
  decision: z.enum(['approve', 'decline']),
  note: z.string().optional(),
});

export type GroupBookingApprovalInput = z.infer<typeof groupBookingApprovalSchema>;
