import { z } from 'zod';

const uuid = z.string().uuid();
const money = z.number().int().nonnegative(); // paise
const bps = z.number().int().min(0).max(10000);
const minute = z.number().int().min(0).max(1440);

export const CreateSchedule = z.object({
  name: z.string().min(1).max(80),
  daysMask: z.number().int().min(0).max(127).default(127),
  startMinute: minute,
  endMinute: minute,
}).refine((s) => s.endMinute > s.startMinute, { message: 'endMinute must be after startMinute' });
export const UpdateSchedule = CreateSchedule.innerType().partial();

export const CreateCategory = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(500).optional(),
  imageUrl: z.string().url().optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
  scheduleId: uuid.nullable().optional(),
});
export const UpdateCategory = CreateCategory.partial();

export const CreateItem = z.object({
  categoryId: uuid,
  name: z.string().min(1).max(160),
  description: z.string().max(1000).optional(),
  imageUrl: z.string().url().optional(),
  sku: z.string().max(64).optional(),
  basePrice: money,
  taxRateBps: bps.optional(),
  hsnCode: z.string().max(16).optional(),
  isVeg: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  station: z.string().max(40).optional(),
  scheduleId: uuid.nullable().optional(),
});
export const UpdateItem = CreateItem.partial();

export const CreateVariant = z.object({
  name: z.string().min(1).max(80),
  priceDelta: z.number().int().default(0),
  isDefault: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  isAvailable: z.boolean().optional(),
});
export const UpdateVariant = CreateVariant.partial();

export const CreateModifierGroup = z.object({
  name: z.string().min(1).max(80),
  minSelect: z.number().int().min(0).default(0),
  maxSelect: z.number().int().min(1).default(1),
}).refine((g) => g.maxSelect >= g.minSelect, { message: 'maxSelect must be >= minSelect' });
export const UpdateModifierGroup = CreateModifierGroup.innerType().partial();

export const CreateModifierOption = z.object({
  name: z.string().min(1).max(80),
  price: money.default(0),
  isDefault: z.boolean().optional(),
  isAvailable: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
});
export const UpdateModifierOption = CreateModifierOption.partial();

/** Replace the full ordered list of modifier groups on an item. */
export const SetItemModifierGroups = z.object({ groupIds: z.array(uuid).max(20) });

export const UpsertOutletPrice = z.object({
  outletId: uuid,
  price: money.nullable().optional(),
  isAvailable: z.boolean().nullable().optional(),
});
export const UpsertOutletPrices = z.object({ prices: z.array(UpsertOutletPrice).min(1).max(200) });

export const ComboItemInput = z.object({ itemId: uuid, variantId: uuid.optional(), qty: z.number().int().min(1).max(50).default(1) });
export const CreateCombo = z.object({
  name: z.string().min(1).max(160),
  description: z.string().max(1000).optional(),
  imageUrl: z.string().url().optional(),
  price: money,
  isAvailable: z.boolean().optional(),
  sortOrder: z.number().int().optional(),
  items: z.array(ComboItemInput).min(1).max(30),
});
export const UpdateCombo = CreateCombo.partial();

export const ListItemsQuery = z.object({
  categoryId: uuid.optional(),
  outletId: uuid.optional(),
  q: z.string().max(80).optional(),
  includeUnavailable: z.coerce.boolean().optional(),
});

export type CreateSchedule = z.infer<typeof CreateSchedule>;
export type UpdateSchedule = z.infer<typeof UpdateSchedule>;
export type CreateCategory = z.infer<typeof CreateCategory>;
export type UpdateCategory = z.infer<typeof UpdateCategory>;
export type CreateItem = z.infer<typeof CreateItem>;
export type UpdateItem = z.infer<typeof UpdateItem>;
export type CreateVariant = z.infer<typeof CreateVariant>;
export type UpdateVariant = z.infer<typeof UpdateVariant>;
export type CreateModifierGroup = z.infer<typeof CreateModifierGroup>;
export type UpdateModifierGroup = z.infer<typeof UpdateModifierGroup>;
export type CreateModifierOption = z.infer<typeof CreateModifierOption>;
export type UpdateModifierOption = z.infer<typeof UpdateModifierOption>;
export type SetItemModifierGroups = z.infer<typeof SetItemModifierGroups>;
export type UpsertOutletPrices = z.infer<typeof UpsertOutletPrices>;
export type CreateCombo = z.infer<typeof CreateCombo>;
export type UpdateCombo = z.infer<typeof UpdateCombo>;
export type ListItemsQuery = z.infer<typeof ListItemsQuery>;
