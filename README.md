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
