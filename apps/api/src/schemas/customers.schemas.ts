import { z } from 'zod';

export const CreateCustomer = z.object({
  name: z.string().min(1).max(120),
  phone: z.string().min(6).max(20),
  email: z.string().email().max(160).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
export type CreateCustomer = z.infer<typeof CreateCustomer>;

export const UpdateCustomer = z.object({
  name: z.string().min(1).max(120).optional(),
  phone: z.string().min(6).max(20).optional(),
  email: z.string().email().max(160).nullable().optional(),
  notes: z.string().max(500).nullable().optional(),
});
export type UpdateCustomer = z.infer<typeof UpdateCustomer>;

export const ListCustomersQuery = z.object({
  q: z.string().max(120).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
export type ListCustomersQuery = z.infer<typeof ListCustomersQuery>;
