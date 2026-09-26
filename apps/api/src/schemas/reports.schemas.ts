import { z } from 'zod';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'YYYY-MM-DD');

export const ReportRangeQuery = z
  .object({ outletId: uuid, from: date, to: date })
  .refine((q) => q.from <= q.to, { message: 'from must be <= to', path: ['from'] });
export type ReportRangeQuery = z.infer<typeof ReportRangeQuery>;
