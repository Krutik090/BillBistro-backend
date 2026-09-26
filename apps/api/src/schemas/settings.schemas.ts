import { z } from 'zod';

/** Business profile (Tenant). currency/timezone are display-only for now — not editable via this pass. */
export const UpdateSettings = z.object({
  name: z.string().min(1).max(160).optional(),
  gstin: z.string().max(20).nullable().optional(),
});
export type UpdateSettings = z.infer<typeof UpdateSettings>;
