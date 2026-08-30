# BillBistro — Security Checklist Gate (T-013)  ·  as-run against phase0-backend @ ccd8ce0

Maps PLAN.md §6 + §4 to checkable gates. Verified 2026-08-30 against Jim's scaffold.
Legend: ✅ present/verified · ⚠️ gap (hardening needed, not a merge-blocker for scaffold) ·
❌ blocker · N/A deferred to a later phase.

## A. Multi-tenancy & isolation (§4 — #1 severity class)
| # | Control | Verdict | Evidence |
|---|---------|---------|----------|
| A1 | `tenant_id` NOT NULL on every tenant table | ✅ | schema.prisma: all 16 tenant models carry `tenantId @db.Uuid` |
| A2 | RLS ENABLED + FORCED on every tenant table | ✅ | `20260830000100_rls`: ENABLE+FORCE on 16 tables; live DB confirmed |
| A3 | Policy filters by `app.tenant_id` | ✅ | policy `app_rls_bypass() OR tenant_id = app_current_tenant()`; isolation suite PASS |
| A4 | App sets tenant context before queries | ✅ | `PrismaService.withTenant/scoped` set GUC in-tx; interceptor binds ALS |
| A5 | DB app-role non-superuser, NOBYPASSRLS | ✅ | init.sql: `billbistro_app ... NOSUPERUSER NOBYPASSRLS`; asserted in rls-check |
| A6 | Planted leak FAILS the suite | ✅ | negative-control run exits 1; meta-test proves non-vacuous |
| A7 | No cache key / queue job without tenant_id | N/A | no Redis/BullMQ code in Phase 0 yet — revisit when added |
| A8 | `app.bypass_rls` never on in request paths | ✅ | guard tests: not set inside scoped tx; transaction-local (doesn't persist) |

## B. AuthN (§6)
| # | Control | Verdict | Evidence |
|---|---------|---------|----------|
| B1 | Short-lived access JWT | ✅ | `JWT_ACCESS_TTL_SECONDS=900` (15m) |
| B2 | Refresh rotating, httpOnly+SameSite cookie | ✅ | auth.controller: `{ httpOnly:true, secure:env.COOKIE_SECURE, sameSite:'lax' }` |
| B3 | Expired JWT rejected | ✅ | JwtAuthGuard `verifyAsync` → 401 on failure |
| B4 | Tampered JWT rejected | ✅ | same path; secret-verified |
| B5 | Token carries tenant/role claims | ✅ | claims `tid, roles, perms` → req.user |
| B6 | Brute-force lockout / login rate-limit | ⚠️ GAP | no lockout/attempt tracking in auth.service |
| B7 | 2FA for owners/admins | N/A | deferred |

## C. AuthZ / RBAC (§6)
| # | Control | Verdict | Evidence |
|---|---------|---------|----------|
| C1 | Role/permission guard denies wrong-role | ✅ (with note) | global APP_GUARD: JwtAuthGuard→PermissionsGuard; `@RequirePermissions` enforced |
| C2 | Outlet scoping | ⚠️ partial | UserRole carries `outletId`; no outlet-scope guard yet (fine for Phase 0) |
| C3 | RBAC in guards AND RLS (defense in depth) | ✅ | guards + FORCED RLS both proven |
| C1-note | PermissionsGuard `if(!user) return true` is fail-OPEN if a required-perm route ever runs without JwtAuthGuard | ⚠️ low | mitigated today by global guard order; recommend deny-by-default when required perms exist |

## D. App hardening (§6)
| # | Control | Verdict | Evidence |
|---|---------|---------|----------|
| D1 | Input validation at boundaries | ✅ | `ZodValidationPipe` on login/menu/orders bodies (per-route; consider global pipe) |
| D2 | Strict CORS (allowlist, not `*`) | ✅ | `enableCors({ origin: env.CORS_ORIGINS[], credentials:true })` |
| D3 | Helmet headers | ✅ | `app.use(helmet())` |
| D4 | Rate limiting (global + per-tenant) | ⚠️ GAP | no @nestjs/throttler / rate-limit middleware |
| D5 | CSRF on cookie auth | ✅ adequate | SameSite=lax on auth cookies; revisit if cross-site POST needed |
| D6 | No stack traces leaked in prod | ⚠️ verify | no global exception filter seen; Nest default hides 500 detail — confirm before launch |

## E. Money & correctness
| # | Control | Verdict | Evidence |
|---|---------|---------|----------|
| E1 | Money as integer minor units | ✅ | all $ columns `Int` (basePrice, amount, total, subtotal, taxTotal, lineTotal…) |
| E2 | Idempotency on order/payment writes | ✅ | Order `@@unique([tenantId,clientKey])` + controller dedupe; Payment `@@unique([tenantId,idempotencyKey])` |
| E3 | Optimistic concurrency on billing | ✅ partial | Order/Bill carry `version` (Int); enforcement in write paths TBD in Phase 1 |
| E4 | Audit log on money mutations | ⚠️ GAP | no `audit_logs` table/writes in Phase 0 (planned §5) |
| E5 | Signed webhooks (HMAC) | N/A | no gateway in MVP |

## F. Ops / supply chain
| # | Control | Verdict | Evidence |
|---|---------|---------|----------|
| F1 | No secrets in code | ⚠️ | dev secrets in `.env` + compose (`dev-*-change-me`) — fine for dev; ensure prod via secret manager. `.env` IS committed — verify it holds no real creds before any public push |
| F2 | Dependency scanning in CI | ⚠️ TODO | add Dependabot / `pnpm audit` job |
| F3 | `/security-review` before Phase 0 sign-off | ⚠️ TODO | run before phase gate |

## Gaps filed to god (hardening backlog, none block the Phase-0 scaffold gate)
1. **No rate limiting** (D4) + **no brute-force lockout** (B6) → add `@nestjs/throttler` before Phase 1 auth exposure.
2. **PermissionsGuard fail-open** (C1-note) → deny when required perms exist but no principal.
3. **No audit_logs** (E4) → required before real money flows (Phase 1).
4. **CI**: no dependency-audit / global exception filter yet (F2, D6).
5. **BUILD/BOOT BUG (higher priority)** — see report: pnpm v11 blocks dependency build scripts, so `prisma generate` never runs on a clean `pnpm install` → Prisma client missing → API cannot boot from a fresh clone. Root package.json needs `pnpm.onlyBuiltDependencies` (or CI/Docker must generate explicitly, as this CI now does).
