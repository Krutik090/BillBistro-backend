import { z } from 'zod';

const uuid = z.string().uuid();
const money = z.number().int().nonnegative();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

export const CreateBill = z.object({
  orderId: uuid,
  /** merge: additional OPEN orders (same outlet) folded into this bill */
  mergeOrderIds: z.array(uuid).max(20).optional(),
  discount: money.optional(), // absolute paise, applied BEFORE tax
  discountNote: z.string().max(200).optional(),
  tip: money.optional(),
  /** split: this bill is share index/count of the order (0-based index like the sdk) */
  splitOf: z.object({ index: z.number().int().min(0), count: z.number().int().min(2).max(20) }).refine((s) => s.index < s.count, { message: 'index < count' }).optional(),
  clientKey: z.string().min(8).max(80).optional(),
});
export type CreateBill = z.infer<typeof CreateBill>;

export const UpdateBill = z.object({
  discount: money.optional(),
  discountNote: z.string().max(200).optional(),
  tip: money.optional(),
  version: z.number().int().optional(),
});
export type UpdateBill = z.infer<typeof UpdateBill>;

export const Finalize = z.object({ version: z.number().int().optional() });
export type Finalize = z.infer<typeof Finalize>;

export const VoidBill = z.object({ reason: z.string().min(2).max(300) });
export type VoidBill = z.infer<typeof VoidBill>;

export const CreatePayment = z.object({
  mode: z.enum(['CASH', 'UPI', 'CARD', 'WALLET', 'OTHER']),
  amount: z.number().int().positive(),
  tendered: money.optional(), // cash given; change = tendered - amount
  reference: z.string().max(120).nullable().optional(), // UPI UTR / card slip
  idempotencyKey: z.string().min(8).max(80),
});
export type CreatePayment = z.infer<typeof CreatePayment>;

export const CreateRefund = z.object({
  amount: z.number().int().positive(),
  reason: z.string().min(2).max(300),
  reference: z.string().max(120).nullable().optional(),
  idempotencyKey: z.string().min(8).max(80),
});
export type CreateRefund = z.infer<typeof CreateRefund>;

export const ListBillsQuery = z.object({
  outletId: uuid.optional(),
  status: z.enum(['DRAFT', 'FINAL', 'SETTLED', 'VOID']).optional(),
  orderId: uuid.optional(),
  businessDate: date.optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListBillsQuery = z.infer<typeof ListBillsQuery>;

export const DayCloseInput = z.object({ outletId: uuid, businessDate: date, note: z.string().max(300).optional() });
export type DayCloseInput = z.infer<typeof DayCloseInput>;
export const DayCloseQuery = z.object({ outletId: uuid, businessDate: date });
export type DayCloseQuery = z.infer<typeof DayCloseQuery>;
