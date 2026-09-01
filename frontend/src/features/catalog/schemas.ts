import { z } from 'zod';

// Real backend shape (contracts/openapi.yaml -- Category/CategoryCreate/
// CategoryUpdate). Field names are snake_case here: AccountSerializer,
// CategorySerializer etc. use plain DRF ModelSerializer field names, not
// the camelCase renderer the plain (non-model) serializers use elsewhere
// in this API. price_etb is a decimal-formatted string, not a number.
// There are no description fields on the backend at all -- keeping them
// here would just be more invented data the server will silently drop.

export interface Category {
  id: string;
  name_en: string;
  name_am: string;
  price_etb: string; // decimal string, e.g. "100.00"
  is_free: boolean;
  active: boolean;
}

export const categoryCreateSchema = z.object({
  name_en: z.string()
    .min(2, 'English name must be at least 2 characters')
    .max(50, 'English name must be less than 50 characters'),
  name_am: z.string()
    .min(2, 'Amharic name must be at least 2 characters')
    .max(50, 'Amharic name must be less than 50 characters'),
  price_etb: z.string()
    .regex(/^\d{1,10}(\.\d{1,2})?$/, 'Enter a valid price, e.g. 100 or 100.00'),
  is_free: z.boolean().default(false),
});

export const categoryUpdateSchema = categoryCreateSchema.partial().extend({
  active: z.boolean().optional(),
});

export type CategoryCreateInput = z.infer<typeof categoryCreateSchema>;
export type CategoryUpdateInput = z.infer<typeof categoryUpdateSchema>;
// Form state mirrors CategoryUpdateInput with everything required except
// `active`, since the form always edits the full set of editable fields.
export type CategoryFormInput = Required<Omit<CategoryUpdateInput, 'active'>> & {
  active?: boolean;
};
