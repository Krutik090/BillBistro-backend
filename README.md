# BillBistro — backend

Multi-tenant restaurant POS / management SaaS — the Node.js/Express API. See `PLAN.md` (authoritative).
The four client apps (POS, Dashboard, KDS, QR menu) live in the sibling `billbistro-frontend` repo.

## Layout

```
apps/api          Node.js + Express API (auth, tenancy, menu, floor, orders/KOT, billing)
  src/server.ts       entry point: connect, listen, graceful shutdown
  src/app.ts          express app assembly (middleware order = rate-limit -> authn -> authz -> tenant ctx)
  src/routes/         one <name>.routes.ts per domain (path + method + policy + Zod schema + controller fn);
                       router.ts is the route-registration engine, index.ts mounts everything onto the app
  src/controllers/    req/res handlers — thin, call into services/
  src/services/       business logic (money math, state machines, idempotency) — framework-agnostic
  src/middlewares/    auth, permissions (deny-by-default), tenant context (ALS), rate limit, error handler
  src/schemas/        Zod request/query schemas per domain
  src/database/       Prisma client + tenant-scoping helpers (scoped / withTenant / system)
  src/context/        AsyncLocalStorage request context (tenant id, user, roles)
  src/utils/          errors, JWT, pricing math, OpenAPI-doc generation
  src/types/          shared TS types + Express.Request augmentation
  src/container.ts    composition root — explicit `new` wiring instead of a DI container
packages/types    shared Zod schemas + TS types
packages/config   tsconfig presets, design tokens, tailwind theme (consumed by the frontend repo)
prisma/           schema + migrations (incl. RLS policies) + seed
infra/            docker-compose (postgres 16 + redis 7 + api), api.Dockerfile
scripts/          rls-check.ts, tenant-isolation.check.ts, money-check.ts, hardening-check.ts, orders-e2e.ts, billing-e2e.ts, reports-e2e.ts, signup-e2e.ts, inventory-e2e.ts
docs/qa/          security gate + test-strategy notes
```

## Run (local dev)

```bash
npm install
cp .env.example .env
docker compose -f infra/docker-compose.yml up -d postgres redis
npm run db:migrate          # prisma migrate deploy (uses DATABASE_URL_MIGRATE = table owner)
npm run db:seed             # demo tenant: slug demo, owner@demo.local / Password123!
npm run db:rls-check        # must print "RLS CHECK PASSED"
npm run api:dev             # http://localhost:4000/health  docs: /docs
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
- In code: `prisma.scoped.<model>` (tenant from request context, set by the tenant-context middleware
  from the JWT), `prisma.withTenant(tenantId, fn)` for multi-step transactions,
  `prisma.system(fn)` (sets `app.bypass_rls=on`) **only** for platform paths such as
  tenant lookup at login.
- Money is integer minor units (paise). Tax rates in basis points.

## Auth

JWT access (15m) + rotating refresh (30d, hashed in `refresh_tokens`), both httpOnly cookies
(`access_token` on `/`, `refresh_token` on `/v1/auth`). Bearer header also accepted.
RBAC is **deny-by-default and structural**: every route is declared through `makeRouter([...])`, and
`policy` is a required field — `PUBLIC`, `AUTHENTICATED`, or `permissions('menu.write', ...)`, checked
against the `perms` claim. A route cannot be registered without stating its policy, so "forgot to
guard it" is a compile error rather than an open endpoint.
Routes: `POST /v1/auth/login|refresh|logout`, `GET /v1/auth/me`.

## Verify (once a DB is reachable)

```bash
npm run db:migrate && npm run db:seed && npm run db:rls-check
curl http://localhost:4000/health   # {"status":"ok","db":"up",...}
```

## API surface (Phase 1 so far)

| Area | Base | RBAC |
|---|---|---|
| Auth | `POST /v1/auth/login|refresh|logout|signup`, `GET /v1/auth/me` — signup provisions a tenant + owner + first outlet in one transaction, then auto-logs in | public / any session |
| Menu | `/v1/menu/{schedules,categories,items,variants,modifier-groups,modifier-options,combos}`, `PUT items/:id/pricing`, `PUT items/:id/modifier-groups`, **`GET /v1/menu/outlets/:outletId/effective`** (resolved menu for POS/QR) | `menu.read` / `menu.write` |
| Floor | `/v1/floor/{sections,tables}`, `POST tables/:id/status` (FREE→OCCUPIED→BILLED→CLEANING→FREE, optimistic `version`), **`GET /v1/floor/outlets/:outletId`** | `tables.read` / `tables.write` |
| Outlets | `GET /v1/outlets`, `GET /v1/outlets/:id` | `outlets.read` |
| Orders/KOT | `POST /v1/orders` (clientKey idempotent, server-priced), `GET /v1/orders[/:id]`, `PATCH /v1/orders/:id/items` (KOT-sent lines immutable, `version`), `POST /v1/orders/:id/kots`, `POST /v1/orders/:id/cancel`, `GET /v1/kots` (KDS), `PATCH /v1/kots/:id/status` | `orders.*`, `kots.*` |
| Billing | `POST /v1/bills` (merge `mergeOrderIds`, split `splitOf`, discount-before-tax, tip; clientKey idempotent), `PATCH /v1/bills/:id` (draft), `POST /v1/bills/:id/finalize`, `POST /v1/bills/:id/void`, `POST /v1/bills/:id/payments` (idempotencyKey), `POST /v1/payments/:id/refunds`, `GET /v1/bills/:id/receipt`, `GET`/`POST /v1/day-close` (Z-report; a closed date blocks finalize/pay) | `bills.*`, `payments.*`, `reports.read` |
| Reports | `GET /v1/reports/sales` (gross/discount/tax/tip/net + collections by payment mode + voids, over `outletId`+`from`+`to`), `GET /v1/reports/items` (qty/gross/tax/net per menu line), `GET /v1/reports/tax` (GST by rate bracket) — all read-only, computed off the already-frozen `bills`/`bill_lines`/`payments` | `reports.read` |
| Inventory | `GET`/`POST /v1/inventory/items`, `PATCH /v1/inventory/items/:id`, `POST /v1/inventory/items/:id/adjust` (manual stock movement), `GET /v1/inventory/items/:id/movements` (ledger), `GET /v1/inventory/recipes?menuItemId=`, `PUT /v1/inventory/recipes/:menuItemId` (replace recipe) — stock is integer milli-units (1 unit = 1000, same "no floats" rule as money); sending a KOT auto-deducts recipe-linked stock | `inventory.read`, `inventory.write` |

Money math: `apps/api/src/utils/pricing.ts` + `BillingService.compute` (int paise; per-line GST by bps after proportional pre-tax discount; CGST/SGST halves; tip after tax; grand total rounded to the rupee; split shares sum exactly). Full OpenAPI at `/docs`. Errors share one shape: `{statusCode, error, message, requestId, path}` (+`issues[]` on 400).
Hardening: deny-by-default RBAC, 10 logins/min/IP, lockout after 5 failures (423), append-only `audit_logs`.

## Adding a migration (non-interactive workflow)

`prisma migrate dev` needs a TTY, so migrations are generated by diffing against a scratch DB:

```bash
docker exec billbistro-postgres-1 psql -U postgres -qc "CREATE DATABASE billbistro_shadow"
npx prisma migrate diff --from-migrations prisma/migrations --to-schema-datamodel prisma/schema.prisma \
  --shadow-database-url postgresql://postgres:postgres@localhost:5433/billbistro_shadow --script \
  > prisma/migrations/<YYYYMMDDHHMMSS>_<name>/migration.sql
# then append the RLS block for any NEW tenant table (copy from an earlier migration) and:
npm run db:migrate && npm run db:generate
```
Rule: every new table has `tenant_id` and appears in an RLS block; `scripts/rls-check.ts` must stay green.

## Phase 1 status (2026-08-30)

Built and smoke-verified on `phase1-backend`:

- **Hardening** — deny-by-default RBAC, uniform error shape, throttling + lockout, append-only `audit_logs`.
- **Menu** — schedules, categories, items (nested create), variants, modifier groups, per-outlet pricing, combos, resolved `effective` menu.
- **Floor** — sections, tables, occupancy state machine with optimistic versioning.
- **Orders/KOT** — server-priced lines, idempotent create, KOT routing + KDS feed, immutable sent lines, cancel.
- **Billing** — split (equal-N) / merge bills, discount-before-tax, per-line GST (CGST/SGST), tip, rupee round-off, cash/UPI/card payments (idempotent), refunds, void, receipt payload, day-close Z-report.
- **Reports (T-104)** — sales summary, item-wise sales, GST-by-rate-bracket, all over an outlet + date range; read-only, no new tables.
- **Gates (CI merge blockers):** `npm run check:money` (pure money math) and `npm run db:iso-check` (RLS coverage + cross-tenant sweep); `npm run db:rls-check`, the 423/429 hardening probe, and the orders/billing/reports e2e probes run as extra (non-blocking) checks.

Not built yet: by-item / by-seat split bills, payment gateway, subscriptions/plans, per-tenant theming.

### Run the full stack

```bash
npm install && cp .env.example .env
docker compose -f infra/docker-compose.yml up -d postgres redis      # postgres on host :5433
npm run db:migrate && npm run db:seed                                       # demo tenant + menu + floor
npm run check:money && npm run db:iso-check                                 # gates (both must PASS)
npm run api:dev                                                          # API :4000, Swagger /docs
# frontends: see the billbistro-frontend repo (POS :3000, Dashboard :3001, KDS :3002, QR :3003)
```
Login: tenant `demo`, `owner@demo.local` / `Password123!`. Try: `GET /v1/outlets` → `GET /v1/menu/outlets/:id/effective` → `POST /v1/orders` → `POST /v1/orders/:id/kots` → `POST /v1/bills` → `/finalize` → `/payments` → `GET /v1/bills/:id/receipt` → `POST /v1/day-close`.
