import { z } from 'zod';

export const categorySchema = z.object({
  id: z.string().uuid().optional(),
  nameEn: z.string()
    .min(2, 'English name must be at least 2 characters')
    .max(50, 'English name must be less than 50 characters'),
  nameAm: z.string()
    .min(2, 'Amharic name must be at least 2 characters')
    .max(50, 'Amharic name must be less than 50 characters'),
  priceEtb: z.number()
    .min(0, 'Price cannot be negative')
    .max(9999, 'Price must be less than 10,000 ETB'),
  isFree: z.boolean().default(false),
  descriptionEn: z.string()
    .max(200, 'Description must be less than 200 characters')
    .optional(),
  descriptionAm: z.string()
    .max(200, 'Description must be less than 200 characters')
    .optional(),
  active: z.boolean().default(true),
});

export const categoryCreateSchema = categorySchema.omit({ id: true, active: true });
export const categoryUpdateSchema = categorySchema.partial();

export type CategoryFormInput = z.infer<typeof categorySchema>;
export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
