import { z } from 'zod';

const uuid = z.string().uuid();

export const OrderLineInput = z.object({
  itemId: uuid,
  qty: z.number().int().min(1).max(999),
  variantId: uuid.nullable().optional(),
  modifierIds: z.array(uuid).max(30).optional(), // ModifierOption ids
  notes: z.string().max(300).nullable().optional(),
  clientLineId: z.string().max(64).optional(), // echoed back so optimistic UI lines reconcile
});
export type OrderLineInput = z.infer<typeof OrderLineInput>;

export const CreateOrder = z
  .object({
    type: z.enum(['DINE_IN', 'TAKEAWAY', 'DELIVERY']).default('DINE_IN'),
    outletId: uuid.optional(), // required unless tableId given (derived from the table)
    tableId: uuid.nullable().optional(),
    tableRef: z.string().max(40).nullable().optional(), // display label when no physical table
    guestCount: z.number().int().min(1).max(200).optional(),
    notes: z.string().max(500).optional(),
    items: z.array(OrderLineInput).min(1).max(200),
    clientKey: z.string().min(8).max(80).optional(), // idempotency key; replay returns the same order
  })
  .refine((o) => o.outletId || o.tableId, { message: 'outletId or tableId is required' });
export type CreateOrder = z.infer<typeof CreateOrder>;

/** Replace the order's lines. Lines already sent to the kitchen are locked (cannot be removed / reduced). */
export const ReplaceItems = z.object({
  items: z.array(OrderLineInput).min(0).max(200),
  version: z.number().int().optional(),
});
export type ReplaceItems = z.infer<typeof ReplaceItems>;

export const CreateKot = z.object({
  orderItemIds: z.array(uuid).max(200).optional(), // default: every line not yet on a KOT
  station: z.string().max(40).optional(),
});
export type CreateKot = z.infer<typeof CreateKot>;

export const SetKotStatus = z.object({ status: z.enum(['PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED']) });
export type SetKotStatus = z.infer<typeof SetKotStatus>;

export const CancelOrder = z.object({ reason: z.string().min(2).max(300), version: z.number().int().optional() });
export type CancelOrder = z.infer<typeof CancelOrder>;

export const ListOrdersQuery = z.object({
  outletId: uuid.optional(),
  status: z.enum(['OPEN', 'BILLED', 'SETTLED', 'CANCELLED']).optional(),
  tableId: uuid.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListOrdersQuery = z.infer<typeof ListOrdersQuery>;

export const ListKotsQuery = z.object({
  outletId: uuid,
  status: z.enum(['PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED']).optional(),
  station: z.string().max(40).optional(),
});
export type ListKotsQuery = z.infer<typeof ListKotsQuery>;
