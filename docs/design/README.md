# BillBistro Design System

**Figma:** https://www.figma.com/design/HUzJ2Uc3NksZSAITqoxUei/BillBistro-Design-System
(pages: `Components`, `Hero / POS + KDS`, `Hero / Dashboard` — the Starter plan caps the file at 3 pages and 1 variable mode).

## Single source of truth
`packages/config/tokens/tokens.json` (DTCG format). `node packages/config/tokens/build.mjs` emits
`tokens/dist/tokens.css` (CSS vars, `[data-theme=dark|light]`) and `tokens.ts`. Tailwind v4 maps them in
`packages/config/tailwind/theme.css`. The Figma file carries the same tokens as variables
(`Primitives` collection: `color/*`, `space/*`, `radius/*`, `font/size/*`; `Semantic` collection:
`semantic/*` aliases, Dark mode) with WEB code syntax set to the matching CSS var, e.g.
`semantic/primary` → `var(--primary)`. Light mode exists only in code (Figma plan allows 1 mode).

| Token group | Figma | Code |
|---|---|---|
| Brand `#FF5C1A` "Flame" | `color/brand/500` | `--color-brand-500`, `bg-brand-500` |
| Surfaces | `semantic/background|surface|surface-raised|surface-overlay` | `bg-background`, `bg-surface`, `bg-surface-raised`, `bg-surface-overlay` |
| Text | `semantic/text|text-muted|text-subtle` | `text-foreground`, `text-muted`, `text-subtle` |
| Status | `semantic/success|warning|danger|info` | `text-success` … |
| Touch target | `space/touch` = 56 | `h-touch` |
| Radius | `radius/sm..2xl` | `rounded-sm..2xl` |
| Elevation | effect styles `Elevation/1..3`, `Elevation/Glow` | `shadow-1..3`, `shadow-glow` |
| Type | Inter (UI), Sora (display/KPIs), JetBrains Mono (money/numbers) | `font-sans`, `font-display`, `font-mono` |
| Motion | — | `spring` 420/32, durations 80/150/220/400ms (`packages/ui/src/lib/motion.ts`) |

## Components (Figma ⇄ `packages/ui`)
Button (Primary/Secondary/Ghost/Danger × Medium 44/Large 56) · Input · Card · Badge (6 tones) · KPI Tile · Table · Drawer.
Code additions: `AppShell` (rail/sidebar nav), `ThemeToggle`. Storybook: `pnpm --filter @billbistro/ui storybook`.

## Hero screens
- `hero-pos-billing.png` — POS billing 1440×900 (rail · catalog · bill panel · 64px glow Charge button)
- `hero-owner-dashboard.png` — Owner dashboard 1440×900 (sidebar · KPI row · sales-by-hour · top items · live orders)
- `hero-kds.png` — KDS 1920×1080 (station filter · color-coded ticket headers · 28px item text · BUMP)
- `component-table.png`, `component-drawer.png` — component references
