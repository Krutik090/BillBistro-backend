# BillBistro — Master Plan

> A multi-tenant, web-based Restaurant Management + Billing/POS SaaS platform
> (a Petpooja-class product). Scalable, fast, secure, multi-client, with an
> impressive UI. This is the authoritative plan the hive builds against.

Version: 1.0 · Owner: Michael (orchestrator) · Date: 2026-08-27

---

## 1. Product Vision & Scope

BillBistro is a cloud SaaS that a restaurant/cafe/cloud-kitchen chain subscribes
to. One deployment serves **many restaurant businesses (tenants)**, each with one
or more **outlets**, each outlet running **billing (POS), kitchen, inventory,
menu, staff, CRM and reporting** from a single web app. Also ships a **Kitchen
Display (KDS)** view and a **customer-facing QR ordering** page.

### Target users (roles)
- **Platform Admin** (us) — onboard tenants, manage plans, monitor health.
- **Business Owner** — owns a tenant, sees all outlets, billing, analytics.
- **Outlet Manager** — runs one outlet: menu, staff, day-close, reports.
- **Cashier / Steward** — takes orders, generates bills, settles payments.
- **Kitchen** — KDS screen, marks items ready.
- **Customer** — QR-scan menu, self-order, pay (optional module).

### Core modules (MVP → full)
1. **Billing / POS** — table & counter orders, KOT, split/merge bills, discounts,
   taxes (GST), tips, multiple payment modes, hold/recall, refunds, day-close.
2. **Menu Management** — categories, items, variants, add-ons/modifiers, combos,
   pricing per outlet, availability, timings (happy hours).
3. **Table & Floor Management** — sections, tables, reservations, occupancy.
4. **KOT & Kitchen Display (KDS)** — real-time order routing to kitchen screens/printers.
5. **Inventory & Recipe** — stock, units, recipe-based auto-deduction, wastage, purchase orders, vendors, low-stock alerts.
6. **CRM & Loyalty** — customers, order history, loyalty points, coupons, campaigns.
7. **Staff & Roles** — users, RBAC, attendance, shift, permissions per outlet.
8. **Online Ordering / QR** — customer self-ordering, aggregator sync (Swiggy/Zomato) later.
9. **Reports & Analytics** — sales, item-wise, tax, profitability, live dashboard.
10. **Platform/Tenant Admin** — subscriptions, plans, billing to tenants, feature flags.
11. **Settings** — taxes, printers, receipt templates, payment gateways, integrations.

---

## 2. Architecture Overview

**Style:** Modular monolith first (single deployable API, module boundaries
enforced in code) → extract high-load modules (KDS/real-time, reporting) into
services only when scale demands. This gives fast delivery now and a clean path
to microservices later.

```
                     ┌─────────────────────────────────────────┐
                     │            Clients (browsers)            │
   POS Web App  ─────┤  KDS Screen · Owner Dashboard · QR Menu  │
                     └───────────────┬──────────────────────────┘
                                     │ HTTPS / WSS
                         ┌───────────▼───────────┐
                         │   CDN + Edge (assets) │
                         └───────────┬───────────┘
                                     │
                         ┌───────────▼───────────┐
                         │  API Gateway / LB      │  (rate-limit, TLS, WAF)
                         └───────────┬───────────┘
              ┌──────────────────────┼──────────────────────┐
              │                      │                       │
      ┌───────▼───────┐   ┌──────────▼─────────┐   ┌─────────▼────────┐
      │  App API      │   │  Realtime Service  │   │  Worker/Queue     │
      │ (modular      │   │  (WebSocket: KOT,  │   │  (jobs: reports,  │
      │  monolith)    │   │   KDS, live orders)│   │   emails, sync)   │
      └───┬───────┬───┘   └──────────┬─────────┘   └─────────┬────────┘
          │       │                  │                       │
   ┌──────▼──┐ ┌──▼──────┐    ┌──────▼──────┐        ┌───────▼──────┐
   │Postgres │ │  Redis  │    │   Redis     │        │  Object Store│
   │(multi-  │ │ (cache, │    │  Pub/Sub    │        │  (S3/receipts│
   │ tenant) │ │ session)│    │             │        │   images)    │
   └─────────┘ └─────────┘    └─────────────┘        └──────────────┘
```

### Key architectural decisions
- **Multi-tenancy:** shared database, **`tenant_id` on every row + Postgres
  Row-Level Security (RLS)** as the default. Enterprise clients can be promoted to
  a **dedicated schema/DB** later. This is the single most important design rule —
  every query is tenant-scoped and enforced at the DB, not just the app.
- **Real-time:** WebSockets (Socket.IO or native ws) backed by **Redis Pub/Sub**
  so KOT/KDS/live-order events fan out across app instances. Offline-first POS via
  local queue + sync (a cashier must be able to bill during a network blip).
- **Async work:** a queue (BullMQ on Redis) for reports, receipt PDFs, aggregator
  sync, email/SMS, loyalty accrual — never block the billing path.
- **Idempotency + optimistic concurrency** on billing endpoints (an order/payment
  must never double-post on retry).

---

## 3. Recommended Tech Stack

Chosen for developer velocity, performance, a huge hiring pool, one language
end-to-end (TypeScript), and a clean scaling path.

### Frontend
- **React + TypeScript** with **Next.js (App Router)** — SSR/edge for the
  marketing + dashboard, CSR for the fast POS screen.
- **Vite** for the pure-SPA POS surface if we want the leanest possible bundle.
- **State/data:** TanStack Query (server state) + Zustand (local POS state).
- **UI system:** **Tailwind CSS + shadcn/ui + Radix primitives**, **Framer Motion**
  for motion, **Recharts/visx** for analytics. Design-token driven (see §7).
- **Forms/validation:** React Hook Form + Zod (shared schema with backend).
- **Realtime client:** Socket.IO client / native WS with reconnect + offline queue.
- **PWA:** installable POS, offline cache (Workbox), background sync.

### Backend
- **Node.js + TypeScript**, framework **NestJS** (opinionated, modular, DI,
  guards for RBAC/tenant scoping) — or Fastify if we want raw speed and less magic.
  *Recommendation: NestJS* for the module boundaries this product needs.
- **API:** REST (OpenAPI) for CRUD + **tRPC** internal option; GraphQL only if a
  client demands it. WebSocket gateway for realtime.
- **ORM:** **Prisma** (type-safe, migrations) with RLS enforced in Postgres.
- **Auth:** JWT access + refresh (httpOnly cookies), or **Auth via Lucia/Auth.js**;
  optional SSO (Google) for owners. Per-request tenant + role in the token.
- **Validation:** Zod/class-validator at every boundary.

### Data & infra
- **PostgreSQL 16** (primary OLTP) + **read replicas** for reporting.
- **Redis** — cache, sessions, rate-limit, pub/sub, BullMQ queues.
- **Object storage** — S3-compatible (receipts, item images, exports).
- **Search** (later) — Postgres full-text first; Meilisearch/OpenSearch if needed.
- **Analytics store** (later) — ClickHouse or Postgres + materialized views for
  heavy reporting so OLTP stays fast.

### DevOps
- **Docker** + **Docker Compose** (dev) → **Kubernetes** or a managed platform
  (Railway/Render/Fly early; AWS ECS/EKS at scale).
- **CI/CD:** GitHub Actions — lint, typecheck, test, build, migrate, deploy.
- **IaC:** Terraform. **Secrets:** Vault / cloud secret manager.
- **Observability:** OpenTelemetry → Grafana/Tempo/Loki + Prometheus; **Sentry**
  for errors; structured JSON logs with `tenant_id`/`request_id`.

### Payments & integrations
- **Gateways:** Razorpay / Stripe (pluggable adapter). UPI, cards, cash, wallets.
- **Printing:** ESC/POS via a local print bridge / browser print for KOT & bills.
- **Messaging:** Twilio/MSG91 (SMS), WhatsApp Cloud API, email (Resend/SES).
- **Aggregators (phase 2):** Swiggy/Zomato/Petpooja-style webhook adapters.

---

## 4. Multi-Tenancy — the core of "hire multiple clients"

| Concern | Approach |
|---|---|
| Isolation | Shared DB + `tenant_id` + Postgres **RLS** on every table. Set `app.tenant_id` per connection/session; policies filter automatically. |
| Onboarding | Self-serve signup → tenant + owner + first outlet provisioned in a transaction, seeded with default taxes/menu template. |
| Subdomains | `tenant.billbistro.app` (or path/header). Tenant resolved at the gateway → injected into request context. |
| Plans & limits | Subscription tiers (outlets, users, features) enforced by **feature flags** + quota checks. |
| Billing to tenants | Metered/seat billing via Stripe/Razorpay subscriptions; dunning, invoices, trials. |
| Data residency / big clients | Promote a tenant to **dedicated schema or DB** without code changes (tenancy resolver abstracts it). |
| Noisy-neighbor | Per-tenant rate limits + queue priorities; heavy reports run on replicas. |

**Rule for the whole team:** no query, no migration, no cache key without a
`tenant_id` dimension. Cross-tenant leakage is the #1 severity bug class.

---

## 5. Data Model (high level)

Core entities (each carries `tenant_id`, `created_at`, `updated_at`, soft-delete):

- `tenants`, `subscriptions`, `plans`, `outlets`, `users`, `roles`, `permissions`
- `menu_categories`, `menu_items`, `variants`, `modifiers`, `combos`, `item_pricing`
- `tables`, `sections`, `reservations`
- `orders`, `order_items`, `order_item_modifiers`, `kots`
- `bills`, `payments`, `refunds`, `discounts`, `taxes`, `tax_lines`
- `inventory_items`, `recipes`, `stock_movements`, `purchase_orders`, `vendors`
- `customers`, `loyalty_accounts`, `loyalty_transactions`, `coupons`, `campaigns`
- `shifts`, `attendance`, `day_close`
- `audit_logs`, `feature_flags`, `settings`, `printers`, `webhooks`

**Money = integer minor units** (paise/cents), never floats. Every financial
mutation writes an immutable `audit_log`. Bills/payments are append-only + versioned.

---

## 6. Security

- **AuthN:** short-lived JWT access + rotating refresh (httpOnly, SameSite), device
  binding for POS terminals. Optional 2FA for owners/admins.
- **AuthZ:** RBAC (role→permissions) + tenant + outlet scoping enforced by NestJS
  guards **and** Postgres RLS (defense in depth).
- **Data:** TLS everywhere; encryption at rest; PII (customer phone/email) column
  encryption; PCI — never store raw card data, tokenize via gateway.
- **App:** input validation (Zod) at every boundary, output encoding, CSRF on
  cookie auth, strict CORS, Helmet headers, CSP, rate limiting, brute-force lockout.
- **Idempotency keys** on payment/order writes; signed webhooks (HMAC).
- **Auditing:** full audit trail on money, voids, discounts, price overrides.
- **Ops:** least-privilege IAM, secrets in a manager (never in code), dependency
  scanning (Dependabot), SAST + `/security-review` before each release, backups +
  tested restore, per-tenant export/delete (GDPR/data-portability).

---

## 7. UI/UX & Design System (the "impressive" part)

**Goal:** a POS that's faster than the cashier can think, and dashboards that make
owners feel in control — polished, animated, consistent, dark-mode native.

- **Design tokens first** — color, type, spacing, radius, elevation, motion as a
  single token source shared by Figma and code (Style Dictionary / Tailwind theme).
- **Component library** — build BillBistro's own kit on shadcn/ui + Radix so every
  screen is consistent; document in Storybook.
- **Signature surfaces:**
  - *POS billing screen* — big touch targets, keyboard-first, sub-100ms feedback,
    live KOT, split-bill drawer, one-tap payment.
  - *Owner dashboard* — live sales, animated KPI tiles, item heatmaps, drill-down.
  - *KDS* — high-contrast, color-coded timers, glanceable from across a kitchen.
  - *QR menu* — beautiful, fast, mobile-first, brandable per tenant.
- **Motion** — Framer Motion for state transitions, order status, receipt print.
- **Accessibility** — WCAG AA, full keyboard, focus states, screen-reader labels.
- **Per-tenant theming** — logo, brand color, receipt template customizable.

### Using the imported plugins (design pipeline)
- **Figma MCP** — build the design system + high-fidelity screens in Figma; pull
  them into code with `get_design_context` (design → React), keep code and design
  in sync via Code Connect. This is the primary UI production tool.
- **Canva MCP** — marketing site, tenant onboarding graphics, receipt/brand
  templates, social assets.
- **`design` / `dataviz` skills** — quick canvas mockups for screen flows and to
  design the analytics charts to spec before coding them.
- **Motion / video MCPs** — product demo + launch videos when we go to market.

Kickoff design task: a **Figma design system + 3 hero screens** (POS, dashboard,
KDS) so front-end builds against real specs, not guesses.

---

## 8. Scalability & Performance

- **Stateless app instances** behind a load balancer → scale horizontally; sessions
  in Redis. Autoscale on CPU/RPS.
- **DB:** connection pooling (PgBouncer), read replicas for reports, proper indexes
  (composite on `(tenant_id, ...)`), partition hot tables (`orders`) by month/tenant
  at scale, materialized views for dashboards.
- **Caching:** Redis for menu/settings/hot reads (per-tenant keys), HTTP cache +
  CDN for static/menu images, stale-while-revalidate.
- **Realtime:** Redis pub/sub fan-out; rooms scoped per outlet so events stay small.
- **Async everything non-critical** via BullMQ (PDFs, emails, sync, analytics rollups).
- **Frontend:** code-split per module, lazy routes, virtualized long lists, optimistic
  UI on billing, PWA offline cache, image optimization.
- **Targets (SLO):** POS action < 100ms perceived, API p95 < 200ms, dashboard < 1.5s,
  99.9% uptime.

---

## 9. Delivery Roadmap (phased)

| Phase | Weeks | Deliverable |
|---|---|---|
| **0 · Foundation** | 1–2 | Repo, monorepo (pnpm/Turborepo), CI/CD, Docker, base NestJS + Next.js apps, Prisma + Postgres, auth skeleton, **multi-tenant + RLS scaffolding**, design tokens. |
| **1 · POS MVP** | 3–6 | Menu, tables, order → KOT → bill → payment → receipt, taxes/discounts, day-close, basic reports. Single outlet, single tenant end-to-end. |
| **2 · Multi-tenant + KDS** | 7–9 | Tenant onboarding, subscriptions/plans, RBAC, KDS realtime, printer/receipt config, per-tenant theming. |
| **3 · Inventory + CRM** | 10–13 | Inventory/recipe auto-deduct, purchase orders, vendors, customers, loyalty, coupons. |
| **4 · Analytics + QR ordering** | 14–16 | Advanced dashboards, materialized views, QR self-order + online payments. |
| **5 · Integrations + hardening** | 17–20 | Aggregator sync, WhatsApp/SMS, load-test, security review, observability, launch. |

MVP (Phases 0–1) is the proof; Phase 2 unlocks "hire multiple clients".

---

## 10. Repository Structure (proposed monorepo)

```
billbistro/
├─ apps/
│  ├─ api/            # NestJS modular monolith
│  ├─ pos/            # POS web app (Next.js/Vite PWA)
│  ├─ dashboard/      # Owner/admin dashboard (Next.js)
│  ├─ kds/            # Kitchen display
│  └─ qr/             # Customer QR ordering
├─ packages/
│  ├─ ui/             # shared component library (design system)
│  ├─ types/          # shared Zod schemas + TS types (client/server)
│  ├─ config/         # eslint/ts/tailwind presets, tokens
│  └─ sdk/            # typed API client
├─ prisma/            # schema + migrations (RLS policies)
├─ infra/             # docker, terraform, k8s
└─ docs/              # this plan, ADRs, API docs
```

---

## 11. How the Hive Builds This

| Track | Owner (suggested) | First tasks |
|---|---|---|
| **Architecture / orchestration** | Michael (god) | maintain this plan, decompose, sign-offs, integration |
| **Backend / API / data / tenancy** | Jim | Phase 0 scaffold: monorepo, NestJS, Prisma, Postgres RLS, auth |
| **Frontend / POS / design system** | Pam | Phase 0: Next.js apps, Tailwind + shadcn, design tokens, POS shell |
| **Quality / bugs / security** | Dwight | test harness, RLS/tenant-isolation tests, security review gate |
| **Design (Figma/Canva)** | delegated task | Figma design system + 3 hero screens |

Each phase is a set of kanban cards (see `tasks.json`) with a 4-part contract:
Objective · Output · Tools/refs · Boundaries/done.

---

## 12. Open Decisions (need human input where noted)

1. **Backend framework:** NestJS (recommended, modular) vs Fastify (leaner). 
2. **Hosting target early:** managed (Railway/Render/Fly) vs cloud (AWS) from day 1.
3. **Payment gateway priority:** Razorpay (India/UPI-first) vs Stripe vs both.
4. **Market/geo:** India-first (GST, UPI, aggregators) changes tax + payment specifics.
5. **Native mobile later?** PWA covers most POS needs; decide if a native app is required.

Recommended defaults if no preference: **NestJS + Prisma + Postgres, Next.js + Tailwind/shadcn,
managed hosting to start, Razorpay + Stripe both, India-first tax model.**

### ✅ CONFIRMED (2026-08-28)
- **Market:** India-first — GST tax model, UPI-first, Swiggy/Zomato aggregators in a later phase.
- **Hosting:** Managed platform (Railway/Render/Fly) to start; move to AWS/K8s at scale.
- **Payments (MVP):** Cash/offline settlement + **UPI**. Full gateway (Razorpay) deferred to a later phase — POS handles cash/card-machine/UPI-QR settlement first.
- **Framework:** NestJS + Prisma default accepted.
- **Build gate:** Human reviews this plan before Phase 0 is dispatched to the hive.
