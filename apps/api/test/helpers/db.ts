/**
 * apps/api/test/helpers/db.ts — BillBistro T-013 (Dwight owns this file).
 * Seed + reset for the Vitest isolation/integration suites. Matches the real schema
 * (schema.prisma @ ccd8ce0). Cross-tenant seeding uses the owner role under app.bypass_rls.
 *
 * Enable the Vitest harness with: pnpm add -D vitest supertest @types/supertest
 * (offline-blocked today; the DB-layer proof runs via scripts/tenant-isolation.check.ts).
 */
import { PrismaClient, Prisma } from '@prisma/client';

export type SeededTenant = { id: string; rows: Record<string, string> };
export const TENANT_MODELS = ['user', 'menuItem', 'order', 'orderItem', 'bill', 'payment'] as const;

export const appClient = () => new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });
export const ownerClient = () => new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_MIGRATE } } });

/** Run fn in a tx scoped to a tenant (mirrors PrismaService.withTenant). */
export function scoped<T>(app: PrismaClient, tid: string, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return app.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tid}, true)`;
    return fn(tx);
  });
}
export function bypass<T>(c: PrismaClient, fn: (tx: Prisma.TransactionClient) => Promise<T>) {
  return c.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
    return fn(tx);
  });
}

export async function seedTenant(owner: PrismaClient, id: string, tag: string): Promise<SeededTenant> {
  return bypass(owner, async (tx: any) => {
    await tx.tenant.create({ data: { id, tenantId: id, slug: `t-${tag}-${id.slice(0, 8)}`, name: tag } });
    const outlet = await tx.outlet.create({ data: { tenantId: id, code: 'O1', name: `${tag}-outlet` } });
    const user = await tx.user.create({ data: { tenantId: id, email: `owner@${tag}.test`, name: 'Owner', passwordHash: 'x' } });
    const cat = await tx.menuCategory.create({ data: { tenantId: id, name: 'Beverages' } });
    const menuItem = await tx.menuItem.create({ data: { tenantId: id, categoryId: cat.id, name: 'Chai', basePrice: 2000 } });
    const order = await tx.order.create({ data: { tenantId: id, outletId: outlet.id, orderNo: `${tag}-001` } });
    const orderItem = await tx.orderItem.create({ data: { tenantId: id, orderId: order.id, itemId: menuItem.id, name: 'Chai', qty: 1, unitPrice: 2000, taxRateBps: 500, lineTotal: 2000 } });
    const bill = await tx.bill.create({ data: { tenantId: id, outletId: outlet.id, orderId: order.id, billNo: `${tag}-B001`, subtotal: 2000, taxTotal: 100, total: 2100 } });
    const payment = await tx.payment.create({ data: { tenantId: id, billId: bill.id, mode: 'CASH', amount: 2100 } });
    return { id, rows: { user: user.id, menuItem: menuItem.id, order: order.id, orderItem: orderItem.id, bill: bill.id, payment: payment.id } };
  });
}

export async function resetTenants(owner: PrismaClient, ids: string[]) {
  await bypass(owner, async (tx: any) => {
    for (const m of ['payment', 'bill', 'orderItem', 'kot', 'order', 'menuItem', 'menuCategory', 'user', 'outlet']) {
      await tx[m].deleteMany({ where: { tenantId: { in: ids } } });
    }
    await tx.tenant.deleteMany({ where: { id: { in: ids } } });
  });
}
