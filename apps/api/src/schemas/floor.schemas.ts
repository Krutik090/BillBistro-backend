import { z } from 'zod';

const uuid = z.string().uuid();
export const TableStatus = z.enum(['FREE', 'OCCUPIED', 'RESERVED', 'BILLED', 'CLEANING', 'BLOCKED']);
export type TableStatus = z.infer<typeof TableStatus>;

export const CreateSection = z.object({
  outletId: uuid,
  name: z.string().min(1).max(80),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export const UpdateSection = CreateSection.omit({ outletId: true }).partial();

export const CreateTable = z.object({
  outletId: uuid,
  sectionId: uuid,
  code: z.string().min(1).max(20),
  capacity: z.number().int().min(1).max(100).default(4),
  posX: z.number().int().min(0).max(1000).optional(),
  posY: z.number().int().min(0).max(1000).optional(),
  sortOrder: z.number().int().optional(),
  isActive: z.boolean().optional(),
});
export const UpdateTable = CreateTable.omit({ outletId: true }).partial();

/** Occupancy transition. `version` enables optimistic concurrency from the POS (409 on stale). */
export const SetTableStatus = z.object({
  status: TableStatus,
  version: z.number().int().optional(),
});

export const ListTablesQuery = z.object({
  outletId: uuid,
  sectionId: uuid.optional(),
  status: TableStatus.optional(),
  includeInactive: z.coerce.boolean().optional(),
});
export const OutletQuery = z.object({ outletId: uuid, includeInactive: z.coerce.boolean().optional() });

export type CreateSection = z.infer<typeof CreateSection>;
export type UpdateSection = z.infer<typeof UpdateSection>;
export type CreateTable = z.infer<typeof CreateTable>;
export type UpdateTable = z.infer<typeof UpdateTable>;
export type SetTableStatus = z.infer<typeof SetTableStatus>;
export type ListTablesQuery = z.infer<typeof ListTablesQuery>;
export type OutletQuery = z.infer<typeof OutletQuery>;
