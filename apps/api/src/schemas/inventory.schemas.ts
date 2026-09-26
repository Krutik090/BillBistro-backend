import { z } from 'zod';

const uuid = z.string().uuid();
/** All stock quantities are integer milli-units (1 unit = 1000) — never floats. */
const milli = z.number().int();

export const CreateInventoryItem = z.object({
  name: z.string().min(1).max(120),
  unit: z.string().min(1).max(20),
  /** Opening stock, if any — defaults to 0 (receive stock afterwards via /adjust). */
  stockMilli: milli.min(0).optional(),
  lowStockMilli: milli.min(0).optional(),
});
export type CreateInventoryItem = z.infer<typeof CreateInventoryItem>;

export const UpdateInventoryItem = z.object({
  name: z.string().min(1).max(120).optional(),
  unit: z.string().min(1).max(20).optional(),
  lowStockMilli: milli.min(0).optional(),
  isActive: z.boolean().optional(),
});
export type UpdateInventoryItem = z.infer<typeof UpdateInventoryItem>;

export const AdjustStock = z.object({
  /** Signed delta in milli-units: positive = received/corrected up, negative = wastage/corrected down. */
  qtyMilli: milli.refine((n) => n !== 0, 'qtyMilli must be non-zero'),
  reason: z.string().min(2).max(300),
});
export type AdjustStock = z.infer<typeof AdjustStock>;

export const ListInventoryQuery = z.object({
  lowStockOnly: z.coerce.boolean().optional(),
  includeInactive: z.coerce.boolean().optional(),
});
export type ListInventoryQuery = z.infer<typeof ListInventoryQuery>;

export const ListMovementsQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListMovementsQuery = z.infer<typeof ListMovementsQuery>;

export const RecipeQuery = z.object({ menuItemId: uuid });
export type RecipeQuery = z.infer<typeof RecipeQuery>;

export const SetRecipe = z.object({
  lines: z.array(z.object({ inventoryItemId: uuid, qtyMilli: milli.min(1) })).max(50),
});
export type SetRecipe = z.infer<typeof SetRecipe>;
