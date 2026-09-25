import { z } from 'zod';

// One row of the group's ticket breakdown -- same shape as the
// individual-booking flow's own `BookingItemInput`
// (features/booking/components/DateCategoryPicker), since a group visit
// is just as capable of mixing categories (e.g. 25 Student tickets plus
// 2 Adult/Teacher tickets for the accompanying staff, all in one
// booking) as an individual one.
export const groupBookingItemSchema = z.object({
  categoryId: z.string().min(1, 'Please select a ticket category'),
  quantity: z.number().int('Quantity must be a whole number').min(1, 'Quantity must be at least 1'),
});

// Real BookingCreateRequest fields for a group booking (contracts/
// openapi.yaml). There is no organizationName/contactPerson/
// contactEmail/visitTime/specialRequests on the backend -- visitor
// identity comes from the authenticated session, and there's no
// time-of-day concept at all.
//
// groupName/groupTin are both required here, not optional -- the
// backend's own `create_booking` (and the `booking_group_requires_
// group_name`/`booking_group_requires_group_tin` constraints behind it)
// has always rejected a group booking without a group name, and now
// does the same for a missing TIN: the university finance office's
// IFMIS receipt voucher needs both to reconcile an institutional
// payment. Catching that here, before a submit attempt, means the
// visitor never has to see a generic post-submit failure for something
// this form could have told them up front. groupContactPhone remains
// the one genuinely optional field.
export const groupVisitRequestSchema = z.object({
  items: z.array(groupBookingItemSchema).min(1, 'Add at least one ticket category'),
  visitDate: z.string()
    .refine((date) => new Date(date) >= new Date(new Date().toDateString()), 'Visit date must be today or later'),
  groupName: z.string().trim().min(1, 'Group / school name is required').max(100, 'Group name is too long'),
  groupContactPhone: z.string()
    .regex(/^(\+251|0)?[7-9][0-9]{8}$/, 'Please enter a valid Ethiopian phone number')
    .optional()
    .or(z.literal('')),
  // Section 8's TIN decision (UAT round 1): exactly 10 digits, leading
  // zeros preserved -- matches `apps.institutions.services.
  // normalize_tin` exactly, so a value this schema accepts is never
  // rejected server-side for its format. Hyphens/spaces are stripped
  // before the digit-count check (the same separators normalize_tin
  // itself strips), so "0000-900158" and "0000 900158" both pass here
  // exactly as they do on the backend -- this schema doesn't fully
  // validate a real Ethiopian TIN's checksum, which this form has no
  // authoritative source for, only its format.
  groupTin: z.string().trim()
    .transform((value) => value.replace(/[\s-]/g, ''))
    .refine((value) => /^\d{10}$/.test(value), 'TIN must be exactly 10 digits'),
});

export type GroupVisitRequestInput = z.infer<typeof groupVisitRequestSchema>;

