# BillBistro — Test Harness & Tenant-Isolation Strategy (T-013)

Owner: Dwight. Goal: make cross-tenant data leakage **impossible to ship**.

## AS-RUN VERDICT (2026-08-30, phase0-backend @ ccd8ce0)
- **Tenant-isolation suite: PASS** — `scripts/tenant-isolation.check.ts`, 30 assertions across
  users / menu / orders / order_items / bills / payments: A reads only A; A cannot update or
  delete B's rows (0 rows affected); no-context reads fail closed; planted-leak canary is
  non-vacuous and returns only A; meta-test proves the same query WITH bypass sees both tenants.
- **Planted-leak catches leaks: PROVEN** — a negative-control that "forgot to scope" (bypass on)
  FAILED with exit 1, confirming the gate is not a vacuous pass.
- **Jim's `scripts/rls-check.ts`: PASS** — cross-tenant read hidden, no-context empty,
  cross-tenant write rejected by WITH CHECK, app role has no BYPASSRLS.
- **API typecheck: PASS** (`tsc --noEmit`).

## Runner reality
- The **executable gate today is a standalone `tsx` runner** (`scripts/tenant-isolation.check.ts`),
  because Vitest/Supertest cannot be installed on this machine right now (offline; earlier docker/npm
  network EOF). tsx + generated `@prisma/client` are already present, so the proof runs and CI runs it.
- The **Vitest + Supertest HTTP-layer harness** is committed under `apps/api/test/` and turns on with
  `pnpm add -D vitest supertest @types/supertest` (works in CI, which has network). Until then CI's
  isolation gate = the tsx runner (identical assertions at the DB layer).

## Isolation suite design (implemented)
Seed tenants A and B (each: tenant, outlet, user, menu category+item, order, order_item, bill,
payment) via the migrate role under `app.bypass_rls=on`. Then, as the **app role** scoped to A:
per-model read (only A) / updateMany B's id (0) / deleteMany B's id (0); no-context read (0);
tenant-unscoped raw SELECT still returns only A (canary, asserts >0 so never vacuous);
bypass-guard (bypass not set in scoped tx, and is transaction-local).

## Auth / RBAC (HTTP layer — in the Vitest harness, enable when online)
Expired/tampered/missing JWT → 401; wrong-role → 403; wrong-outlet → 403/empty; A's token vs B → denied.

## Confirmed backend conventions (Jim)
GUC `app.tenant_id` (tx-local `set_config(...,true)`); `PrismaService.withTenant(tid, fn)` /
`.scoped` (ALS) / `.system(fn)` (sets `app.bypass_rls`); app role `billbistro_app` NOSUPERUSER
NOBYPASSRLS; RLS FORCED on 16 tables; `permissions` = global catalogue (excluded from sweep);
`DATABASE_URL`=app role, `DATABASE_URL_MIGRATE`=owner; DB on host **port 5433**.

## How to run locally
```
node node_modules/prisma/build/index.js generate      # pnpm blocks this on install — see finding
node node_modules/prisma/build/index.js migrate deploy
node_modules/.bin/tsx scripts/tenant-isolation.check.ts
```
