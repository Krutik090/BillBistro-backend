# BillBistro

Multi-tenant restaurant POS / management SaaS. See `PLAN.md` (authoritative).

> **Status (Phase 0):** backend scaffold committed. **DB verification pending** — the
> RLS proof (`pnpm db:rls-check`), migrations and seed have not yet been run on this
> machine because Docker image pulls were blocked by the local network. See "Verify" below.

## Layout

```
apps/api          NestJS modular monolith (auth, tenancy, menu/orders stubs)
apps/{pos,dashboard,kds,qr}   frontends (Pam)
packages/types    shared Zod schemas + TS types
packages/config   tsconfig presets, design tokens, tailwind theme
packages/ui       shared component library (Pam)
prisma/           schema + migrations (incl. RLS policies) + seed
infra/            docker-compose (postgres 16 + redis 7 + api), api.Dockerfile
scripts/          rls-check.ts — proves cross-tenant isolation through the app role
```

## Run (local dev)

```bash
pnpm install
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d postgres redis
pnpm db:migrate          # prisma migrate deploy (uses DATABASE_URL_MIGRATE = table owner)
pnpm db:seed             # demo tenant: slug demo, owner@demo.local / Password123!
pnpm db:rls-check        # must print "RLS CHECK PASSED"
pnpm api:dev             # http://localhost:4000/health  docs: /docs
# NOTE: postgres is published on host port 5433 (5432 is commonly taken by a local install).
```

Everything in one go (builds the api image, migrates + seeds on boot):

```bash
docker compose -f infra/docker-compose.yml up --build
```

Login:

```bash
curl -c c.txt -H 'content-type: application/json' \
  -d '{"tenantSlug":"demo","email":"owner@demo.local","password":"Password123!"}' \
  http://localhost:4000/v1/auth/login
curl -b c.txt http://localhost:4000/v1/auth/me
```

## Multi-tenancy (the rule)

- Every tenant table carries `tenant_id`, `created_at`, `updated_at`, `deleted_at`.
- Postgres **RLS is FORCED** on every tenant table; policy = `tenant_id = app_current_tenant()`
  where `app_current_tenant()` reads the transaction-local GUC `app.tenant_id`.
- The API connects as `billbistro_app` (**NOSUPERUSER, NOBYPASSRLS**, not the table owner).
  Migrations/seed use `DATABASE_URL_MIGRATE` (owner).
- In code: `prisma.scoped.<model>` (tenant from request context, set by `TenantContextInterceptor`
  from the JWT), `prisma.withTenant(tenantId, fn)` for multi-step transactions,
  `prisma.system(fn)` (sets `app.bypass_rls=on`) **only** for platform paths such as
  tenant lookup at login.
- Money is integer minor units (paise). Tax rates in basis points.

## Auth

JWT access (15m) + rotating refresh (30d, hashed in `refresh_tokens`), both httpOnly cookies
(`access_token` on `/`, `refresh_token` on `/v1/auth`). Bearer header also accepted.
RBAC: `@RequirePermissions('menu.write')` → `PermissionsGuard` checks the `perms` claim.
Routes: `POST /v1/auth/login|refresh|logout`, `GET /v1/auth/me`.

## Verify (once a DB is reachable)

```bash
pnpm db:migrate && pnpm db:seed && pnpm db:rls-check
curl http://localhost:4000/health   # {"status":"ok","db":"up",...}
```

## API surface (Phase 1 so far)

| Area | Base | RBAC |
|---|---|---|
| Auth | `POST /v1/auth/login|refresh|logout`, `GET /v1/auth/me` | public / any session |
| Menu | `/v1/menu/{schedules,categories,items,variants,modifier-groups,modifier-options,combos}`, `PUT items/:id/pricing`, `PUT items/:id/modifier-groups`, **`GET /v1/menu/outlets/:outletId/effective`** (resolved menu for POS/QR) | `menu.read` / `menu.write` |
| Floor | `/v1/floor/{sections,tables}`, `POST tables/:id/status` (FREE→OCCUPIED→BILLED→CLEANING→FREE, optimistic `version`), **`GET /v1/floor/outlets/:outletId`** | `tables.read` / `tables.write` |
| Outlets | `GET /v1/outlets`, `GET /v1/outlets/:id` | `outlets.read` |
| Orders/KOT | `POST /v1/orders` (clientKey idempotent, server-priced), `GET /v1/orders[/:id]`, `PATCH /v1/orders/:id/items` (KOT-sent lines immutable, `version`), `POST /v1/orders/:id/kots`, `POST /v1/orders/:id/cancel`, `GET /v1/kots` (KDS), `PATCH /v1/kots/:id/status` | `orders.*`, `kots.*` |
| Billing | `POST /v1/bills` (merge `mergeOrderIds`, split `splitOf`, discount-before-tax, tip; clientKey idempotent), `PATCH /v1/bills/:id` (draft), `POST /v1/bills/:id/finalize`, `POST /v1/bills/:id/void`, `POST /v1/bills/:id/payments` (idempotencyKey), `POST /v1/payments/:id/refunds`, `GET /v1/bills/:id/receipt`, `GET`/`POST /v1/day-close` (Z-report; a closed date blocks finalize/pay) | `bills.*`, `payments.*`, `reports.read` |

Money math: `apps/api/src/modules/orders/pricing.ts` + `BillingService.compute` (int paise; per-line GST by bps after proportional pre-tax discount; CGST/SGST halves; tip after tax; grand total rounded to the rupee; split shares sum exactly). Full OpenAPI at `/docs`. Errors share one shape: `{statusCode, error, message, requestId, path}` (+`issues[]` on 400).
Hardening: deny-by-default RBAC, 10 logins/min/IP, lockout after 5 failures (423), append-only `audit_logs`.

## Adding a migration (non-interactive workflow)

`prisma migrate dev` needs a TTY, so migrations are generated by diffing against a scratch DB:

```bash
docker exec billbistro-postgres-1 psql -U postgres -qc "CREATE DATABASE billbistro_shadow"
pnpm prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url postgresql://postgres:postgres@localhost:5433/billbistro_shadow --script \
  > prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql
# then append the RLS block for any NEW tenant table (copy from an earlier migration) and:
pnpm db:migrate && pnpm db:generate
```
Rule: every new table has `tenant_id` and appears in an RLS block; `scripts/rls-check.ts` must stay green.
