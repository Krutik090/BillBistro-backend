/**
 * apps/api/test/tenant-isolation.spec.ts — BillBistro T-013 (Dwight)
 * Vitest mirror of scripts/tenant-isolation.check.ts (the DB-layer gate that runs today).
 * Enable with: pnpm add -D vitest supertest @types/supertest   (offline-blocked as of 2026-08-30).
 * Run: node node_modules/prisma/build/index.js generate && vitest run apps/api/test
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { randomUUID } from 'node:crypto';
import { appClient, ownerClient, scoped, bypass, seedTenant, resetTenants, TENANT_MODELS, type SeededTenant } from './helpers/db';

const app = appClient();
const owner = ownerClient();
let A: SeededTenant, B: SeededTenant;
const Aid = randomUUID(), Bid = randomUUID();

beforeAll(async () => { A = await seedTenant(owner, Aid, 'a'); B = await seedTenant(owner, Bid, 'b'); });
afterAll(async () => { await resetTenants(owner, [Aid, Bid]); await app.$disconnect(); await owner.$disconnect(); });

describe('RLS raw-query isolation (DB is the guard)', () => {
  for (const m of TENANT_MODELS) {
    it(`as A, ${m} returns only A's rows`, async () => {
      const rows: any[] = await scoped(app, Aid, (tx: any) => tx[m].findMany());
      expect(rows.length).toBeGreaterThan(0);
      expect(rows.every((r) => r.tenantId === Aid)).toBe(true);
      expect(rows.some((r) => r.id === B.rows[m])).toBe(false);
    });
    it(`as A, updating B's ${m} affects 0 rows`, async () => {
      const n = await scoped(app, Aid, (tx: any) => tx[m].updateMany({ where: { id: B.rows[m] }, data: {} }));
      expect(n.count).toBe(0);
    });
    it(`as A, deleting B's ${m} affects 0 rows`, async () => {
      const n = await scoped(app, Aid, (tx: any) => tx[m].deleteMany({ where: { id: B.rows[m] } }));
      expect(n.count).toBe(0);
    });
  }
  it('no tenant context -> fail closed (0 rows)', async () => {
    const rows = await app.order.findMany({ where: { tenantId: { in: [Aid, Bid] } } });
    expect(rows.length).toBe(0);
  });
});

describe('planted-leak canary (non-vacuous)', () => {
  it('unscoped raw SELECT still returns only A under FORCED RLS', async () => {
    const rows: any[] = await scoped(app, Aid, (tx: any) => tx.$queryRawUnsafe('SELECT tenant_id FROM orders'));
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.every((r) => r.tenant_id === Aid)).toBe(true);
  });
  it('meta: same query WITH bypass sees both tenants (proves assertion is real)', async () => {
    const rows: any[] = await bypass(app, (tx: any) => tx.$queryRawUnsafe('SELECT DISTINCT tenant_id FROM orders'));
    const seen = new Set(rows.map((r) => r.tenant_id));
    expect(seen.has(Aid) && seen.has(Bid)).toBe(true);
  });
});

describe('bypass guard', () => {
  it('bypass not set inside a scoped tx', async () => {
    const [{ b }]: any = await scoped(app, Aid, (tx: any) => tx.$queryRawUnsafe("SELECT current_setting('app.bypass_rls', true) AS b"));
    expect(b === null || b === '' || b === 'off').toBe(true);
  });
});

describe('HTTP endpoint isolation (Supertest) — wire when app HTTP tests land', () => {
  it.todo("GET /v1/orders returns only A's; B's id -> 404");
});
