/**
 * Platform-wide permission catalogue + the standard per-tenant role→permission grants.
 * Single source of truth for prisma/seed.ts, the only place a role/permission set is
 * created (single-restaurant deployment — see PLAN.md §13.9) — kept as one module rather
 * than inlined so it can't drift from what's actually seeded.
 */
export const PERMISSIONS = [
  'tenant.manage', 'outlets.read', 'outlets.write', 'users.read', 'users.write', 'roles.manage',
  'menu.read', 'menu.write', 'orders.read', 'orders.write', 'kots.read', 'kots.write',
  'bills.read', 'bills.write', 'bills.void', 'payments.read', 'payments.write', 'reports.read',
  'tables.read', 'tables.write', 'inventory.read', 'inventory.write', 'customers.read', 'customers.write',
] as const;

export const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  owner: PERMISSIONS,
  manager: PERMISSIONS.filter((p) => p !== 'tenant.manage'),
  cashier: ['outlets.read', 'menu.read', 'orders.read', 'orders.write', 'kots.read', 'bills.read', 'bills.write', 'payments.read', 'payments.write', 'tables.read', 'tables.write', 'customers.read', 'customers.write'],
  kitchen: ['outlets.read', 'kots.read', 'kots.write', 'orders.read'],
};
