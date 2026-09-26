/**
 * Platform-wide permission catalogue + the standard per-tenant role→permission grants.
 * Single source of truth for prisma/seed.ts (the demo tenant) AND AuthService.signup
 * (every self-serve tenant) — a drift between the two would silently give real tenants
 * different access than the demo tenant, which is a security bug, not just an inconsistency.
 */
export const PERMISSIONS = [
  'tenant.manage', 'outlets.read', 'outlets.write', 'users.read', 'users.write', 'roles.manage',
  'menu.read', 'menu.write', 'orders.read', 'orders.write', 'kots.read', 'kots.write',
  'bills.read', 'bills.write', 'bills.void', 'payments.read', 'payments.write', 'reports.read',
  'tables.read', 'tables.write', 'inventory.read', 'inventory.write',
] as const;

export const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  owner: PERMISSIONS,
  manager: PERMISSIONS.filter((p) => p !== 'tenant.manage'),
  cashier: ['outlets.read', 'menu.read', 'orders.read', 'orders.write', 'kots.read', 'bills.read', 'bills.write', 'payments.read', 'payments.write', 'tables.read', 'tables.write'],
  kitchen: ['outlets.read', 'kots.read', 'kots.write', 'orders.read'],
};
