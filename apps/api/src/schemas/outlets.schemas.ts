import { z } from 'zod';

export const UpdateOutlet = z.object({
  name: z.string().min(1).max(120).optional(),
  address: z.string().max(300).nullable().optional(),
  phone: z.string().max(30).nullable().optional(),
});
export type UpdateOutlet = z.infer<typeof UpdateOutlet>;
