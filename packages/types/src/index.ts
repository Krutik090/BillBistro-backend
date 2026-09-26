import { z } from 'zod';

/** Money is always integer minor units (paise). */
export const Money = z.number().int().nonnegative();
export type Money = z.infer<typeof Money>;

export const LoginRequest = z.object({
  tenantSlug: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginRequest = z.infer<typeof LoginRequest>;

export const AuthUser = z.object({
  id: z.string().uuid(),
  tenantId: z.string().uuid(),
  email: z.string().email(),
  name: z.string(),
  roles: z.array(z.string()),
  permissions: z.array(z.string()),
});
export type AuthUser = z.infer<typeof AuthUser>;

export const AccessTokenClaims = z.object({
  sub: z.string().uuid(),
  tid: z.string().uuid(),
  roles: z.array(z.string()),
  perms: z.array(z.string()),
});
export type AccessTokenClaims = z.infer<typeof AccessTokenClaims>;

export const OrderStatus = z.enum(['OPEN', 'BILLED', 'SETTLED', 'CANCELLED']);
export const KotStatus = z.enum(['PENDING', 'PREPARING', 'READY', 'SERVED', 'CANCELLED']);
export const PaymentMode = z.enum(['CASH', 'UPI', 'CARD', 'WALLET', 'OTHER']);

export const HealthResponse = z.object({
  status: z.literal('ok'),
  db: z.enum(['up', 'down']),
  version: z.string(),
  time: z.string(),
});
export type HealthResponse = z.infer<typeof HealthResponse>;
