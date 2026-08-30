/* BillBistro T-013 (Dwight) — broad tenant-isolation proof through the app role.
 *
 * Extends scripts/rls-check.ts to EVERY key tenant-scoped model (users, menu, orders,
 * order_items, bills, payments) and adds:
 *   - per-model read / updateMany / deleteMany isolation (A can never touch B)
 *   - no-context fail-closed
 *   - a PLANTED-LEAK canary: a tenant-unscoped raw SELECT still returns only A rows
 *     (asserts length > 0 so it can never pass vacuously)
 *   - a meta-test: the SAME query under app.bypass_rls sees BOTH tenants (proves the
 *     assertion is real — if RLS were off the app-role query would leak like this)
 *   - a bypass guard: app.bypass_rls is never on inside a scoped tx and never persists
 *
 * Runs with the tools already present (tsx + generated @prisma/client). No vitest needed.
 * A single failed assertion exits non-zero => this is a real bug, never weaken RLS.
 */
import 'dotenv/config';
import { PrismaClient, Prisma } from '@prisma/client';

const admin = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL_MIGRATE } } });
const app = new PrismaClient({ datasources: { db: { url: process.env.DATABASE_URL } } });

let failures = 0;
function check(cond: boolean, label: string) {
  if (cond) { console.log(`  PASS  ${label}`); }
  else { console.error(`  FAIL  ${label}`); failures++; }
}

// scoped(tenantId, fn): run fn inside a tx with app.tenant_id set (mirrors PrismaService.withTenant)
function scoped<T>(tid: string, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return app.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.tenant_id', ${tid}, true)`;
    return fn(tx);
  });
}
function bypass<T>(client: PrismaClient, fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  return client.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT set_config('app.bypass_rls', 'on', true)`;
    return fn(tx);
  });
}

type Seed = { id: string; rows: Record<string, string> };
const MODELS = ['user', 'menuItem', 'order', 'orderItem', 'bill', 'payment'] as const;

async function seed(id: string, tag: string): Promise<Seed> {
  return bypass(admin, async (tx: any) => {
    await tx.tenant.create({ data: { id, tenantId: id, slug: `iso-${tag}-${id.slice(0, 8)}`, name: tag } });
    const outlet = await tx.outlet.create({ data: { tenantId: id, code: 'O1', name: `${tag}-outlet` } });
    const user = await tx.user.create({ data: { tenantId: id, email: `owner@${tag}.test`, name: 'Owner', passwordHash: 'x' } });
    const cat = await tx.menuCategory.create({ data: { tenantId: id, name: 'Beverages' } });
    const menuItem = await tx.menuItem.create({ data: { tenantId: id, categoryId: cat.id, name: 'Chai', basePrice: 2000 } });
    const order = await tx.order.create({ data: { tenantId: id, outletId: outlet.id, orderNo: `${tag}-001` } });
    const orderItem = await tx.orderItem.create({ data: { tenantId: id, orderId: order.id, itemId: menuItem.id, name: 'Chai', qty: 1, unitPrice: 2000, taxRateBps: 500, lineTotal: 2000 } });
    const bill = await tx.bill.create({ data: { tenantId: id, outletId: outlet.id, orderId: order.id, billNo: `${tag}-B001`, subtotal: 2000, taxTotal: 100, total: 2100 } });
    const payment = await tx.payment.create({ data: { tenantId: id, billId: bill.id, mode: 'CASH', amount: 2100 } });
    const audit = await tx.auditLog.create({ data: { tenantId: id, action: 'seed', entity: 'tenants', entityId: id } });
    return { id, rows: { user: user.id, menuItem: menuItem.id, order: order.id, orderItem: orderItem.id, bill: bill.id, payment: payment.id, auditLog: audit.id } };
  });
}

async function cleanup(ids: string[]) {
  await bypass(admin, async (tx: any) => {
    for (const m of ['auditLog', 'payment', 'bill', 'orderItem', 'kot', 'order', 'menuItem', 'menuCategory', 'user', 'outlet']) {
      await tx[m].deleteMany({ where: { tenantId: { in: ids } } });
    }
    await tx.tenant.deleteMany({ where: { id: { in: ids } } });
  });
}

/**
 * Coverage guard: every table with a tenant_id column MUST have RLS ENABLED + FORCED
 * and >=1 policy. Auto-catches a NEW tenant table that ships without isolation as the
 * schema grows — no manual per-table wiring. `permissions` has no tenant_id, correctly excluded.
 */
async function coverageGuard() {
  console.log('[0] RLS coverage (every tenant_id table is ENABLED + FORCED + has a policy):');
  const rows: any[] = await admin.$queryRawUnsafe(`
    SELECT c.relname AS "table",
           c.relrowsecurity AS enabled,
           c.relforcerowsecurity AS forced,
           (SELECT count(*)::int FROM pg_policies p WHERE p.schemaname='public' AND p.tablename=c.relname) AS policies
    FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
    WHERE n.nspname='public' AND c.relkind='r'
      AND EXISTS (SELECT 1 FROM pg_attribute a WHERE a.attrelid=c.oid AND a.attname='tenant_id' AND a.attnum>0 AND NOT a.attisdropped)
    ORDER BY c.relname`);
  check(rows.length > 0, `found ${rows.length} tenant-scoped tables to verify`);
  for (const r of rows) {
    check(r.enabled && r.forced && r.policies > 0,
      `${r.table}: RLS enabled=${r.enabled} forced=${r.forced} policies=${r.policies}`);
  }
}

async function main() {
  await coverageGuard();
  const Aid = crypto.randomUUID();
  const Bid = crypto.randomUUID();
  const A = await seed(Aid, 'a');
  const B = await seed(Bid, 'b');
  try {
    console.log('\n[1] Per-model raw isolation (scoped as A):');
    for (const m of MODELS) {
      const rows: any[] = await scoped(Aid, (tx: any) => tx[m].findMany());
      check(rows.length > 0 && rows.every((r) => r.tenantId === Aid), `${m}: A reads only A's rows (${rows.length})`);
      check(!rows.some((r) => r.id === B.rows[m]), `${m}: B's seeded row is invisible to A`);
      const upd = await scoped(Aid, (tx: any) => tx[m].updateMany({ where: { id: B.rows[m] }, data: {} }));
      check(upd.count === 0, `${m}: A updating B's row affects 0 rows`);
      const del = await scoped(Aid, (tx: any) => tx[m].deleteMany({ where: { id: B.rows[m] } }));
      check(del.count === 0, `${m}: A deleting B's row affects 0 rows`);
    }

    console.log('\n[2] Fail-closed with no tenant context:');
    const noCtx = await app.order.findMany({ where: { tenantId: { in: [Aid, Bid] } } });
    check(noCtx.length === 0, `no-context order read returns 0 rows (not all rows)`);

    console.log('\n[3] Planted-leak canary (tenant-unscoped raw SELECT under FORCED RLS):');
    const canary: any[] = await scoped(Aid, (tx: any) => tx.$queryRawUnsafe('SELECT tenant_id FROM orders'));
    check(canary.length > 0, `canary is non-vacuous (saw ${canary.length} rows)`);
    check(canary.every((r) => r.tenant_id === Aid), `unscoped SELECT still returns ONLY A's rows`);

    console.log('\n[4] Meta-test (same query WITH bypass sees both tenants => assertion is real):');
    const leaked: any[] = await bypass(app, (tx: any) => tx.$queryRawUnsafe('SELECT DISTINCT tenant_id FROM orders'));
    const seen = new Set(leaked.map((r) => r.tenant_id));
    check(seen.has(Aid) && seen.has(Bid), `bypass sees BOTH A and B (proves [3] would catch a leak)`);

    console.log('\n[5] Bypass guard (app.bypass_rls must not leak into request paths):');
    const [{ b1 }]: any = await scoped(Aid, (tx: any) => tx.$queryRawUnsafe("SELECT current_setting('app.bypass_rls', true) AS b1"));
    check(b1 === null || b1 === '' || b1 === 'off', `bypass is NOT set inside a scoped tx (got ${JSON.stringify(b1)})`);
    await bypass(app, (tx: any) => tx.$queryRawUnsafe('SELECT 1'));
    const afterBypass = await app.order.findMany({ where: { tenantId: { in: [Aid, Bid] } } });
    check(afterBypass.length === 0, `bypass is transaction-local (fresh read after a bypass tx is still fail-closed)`);

    console.log('\n[6] audit_logs — tenant isolation + APPEND-ONLY (SELECT/INSERT only, no UPDATE/DELETE):');
    const auditRows: any[] = await scoped(Aid, (tx: any) => tx.auditLog.findMany());
    check(auditRows.length > 0 && auditRows.every((r) => r.tenantId === Aid), `audit_logs: A reads only A's rows (${auditRows.length})`);
    check(!auditRows.some((r) => r.id === B.rows.auditLog), `audit_logs: B's audit row is invisible to A`);
    const canInsert = await scoped(Aid, (tx: any) => tx.auditLog.create({ data: { tenantId: Aid, action: 'test.append', entity: 'x' } }).then(() => true).catch(() => false));
    check(canInsert, `audit_logs: A can INSERT its own audit row (append works)`);
    let updBlocked = false;
    try { await scoped(Aid, (tx: any) => tx.$executeRawUnsafe(`UPDATE audit_logs SET action='tamper' WHERE tenant_id='${Aid}'`)); }
    catch { updBlocked = true; }
    check(updBlocked, `audit_logs: UPDATE is blocked for the app role (append-only)`);
    let delBlocked = false;
    try { await scoped(Aid, (tx: any) => tx.$executeRawUnsafe(`DELETE FROM audit_logs WHERE tenant_id='${Aid}'`)); }
    catch { delBlocked = true; }
    check(delBlocked, `audit_logs: DELETE is blocked for the app role (append-only)`);
  } finally {
    await cleanup([Aid, Bid]);
  }

  console.log(`\n==== TENANT-ISOLATION VERDICT: ${failures === 0 ? 'PASS' : `FAIL (${failures} assertion(s))`} ====`);
  if (failures > 0) process.exit(1);
}

main()
  .catch((e) => { console.error('RUNNER ERROR:', e); process.exit(1); })
  .finally(async () => { await admin.$disconnect(); await app.$disconnect(); });
