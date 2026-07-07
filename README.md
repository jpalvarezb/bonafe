# AgroPeq

Bilingual (es/en) farm-management SaaS for Central American agriculture:
farms & parcel maps, crop cycles, activity & cost tracking, pest monitoring,
climate data (manual + satellite rainfall), work orders with checklists,
workers / attendance / payroll (incl. piecework), harvests → processing →
sales with per-cycle profitability, purchases → multi-warehouse inventory
with weighted-average valuation, machinery, planning calendar, budgets vs
actuals, Stripe subscription billing with plan gating, audit trail, and an
installable PWA with offline field capture (activities, monitoring,
attendance, harvest weights) that syncs exactly-once.

## Stack

Next.js (App Router, TypeScript) · PostgreSQL + PostGIS (Drizzle ORM) ·
Better Auth (organizations plugin) · next-intl (es default / en) ·
Tailwind + shadcn/ui · MapLibre GL + Terra Draw · Serwist + Dexie (offline
outbox) · decimal.js (all money math) · Stripe (optional) · Vitest.

## Getting started

```bash
docker compose up -d db      # PostGIS on localhost:5433
cp .env.example .env         # fill BETTER_AUTH_SECRET (openssl rand -base64 32)
pnpm install
pnpm db:migrate
pnpm db:set-app-password     # sets the agropeq_app role's password from APP_DB_PASSWORD
pnpm db:seed                 # demo orgs + fixture data (idempotent, re-runnable)
pnpm dev
```

Demo login: `owner@demo.agropeq.io` / `demo1234` (also `admin@`, `manager@`,
`supervisor@` — same password) → org **finca-demo** (Cosecha trial).
`vecino@demo.agropeq.io` → org **vecino-sa** (Semilla plan, exercises plan
gating and tenant isolation).

The service worker (PWA/offline page caching) exists only in production
builds: `pnpm build && pnpm start`. The offline outbox itself also works in
dev.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | dev server (Turbopack) |
| `pnpm build` | production build (webpack — required by Serwist) |
| `pnpm db:generate` | generate a Drizzle migration from the schema |
| `pnpm db:migrate` | apply migrations |
| `pnpm db:set-app-password` | (re)sets the `agropeq_app` role's password from `APP_DB_PASSWORD` |
| `pnpm db:verify-rls` | coverage guard: every org-scoped table has RLS enabled + a policy |
| `pnpm db:seed` | deterministic demo seed (grows monotonically per phase) |
| `pnpm climate:ingest` | cron entry point: satellite rainfall for all farms |
| `pnpm test` | Vitest unit tests (money/payroll/inventory/variance/profitability calc) |
| `pnpm typecheck` | `tsc --noEmit` |

## Configuration

All env vars are documented in `.env.example`. Notable:

- **Stripe (optional)** — without `STRIPE_SECRET_KEY` the app runs fully with
  plan limits enforced on seeded subscriptions; with it, the plan page gains
  Checkout/portal buttons. `STRIPE_WEBHOOK_SECRET` alone is enough to run the
  webhook state machine (signature is the only trust anchor; events are
  deduped and ordering-guarded). Point the Stripe webhook at
  `/api/webhooks/stripe`.
- **Billing degradation** — `past_due`/`canceled` orgs turn read-only at the
  central `assertCan` choke point: views, member management, and billing
  settings stay available; every domain mutation is refused server-side.
- **Satellite rainfall** — Open-Meteo (keyless, default) and CHIRPS via
  ClimateSERV (experimental) providers write into `climate_readings` with
  per-source idempotent upserts. Schedule `pnpm climate:ingest` daily.

## Architecture

- `src/lib/db/schema/` — Drizzle schema, one file per domain; every tenant
  table carries `org_id`
- `src/lib/tenancy.ts` — `requireOrgContext(locale, orgSlug)`: session +
  membership + role + subscription status
- `src/lib/authz.ts` — role → permission matrix checks + read-only
  degradation (`src/lib/auth/permissions.ts` holds the matrix)
- `src/lib/plan-limits.ts` — plan tiers; `assertOrgFeature` gates every
  tier-restricted mutation server-side (page redirects are UX, not security)
- `src/lib/calc/` — pure Decimal money math (unit-tested before any UI)
- `src/lib/offline/` — Dexie outbox (single write path for offline-capable
  flows) + zod payloads shared with `/api/sync` (idempotent by client UUID)
- `src/server/services/` — business logic; always takes an `OrgContext`,
  always org-scopes queries and validates client-supplied FKs in-org
- `src/server/actions/` — thin server actions (zod parse → service → audit)
- `src/server/reports/` — read-only aggregation (costs, profitability,
  climate), currency-normalized via per-row exchange-rate snapshots
- `src/app/[locale]/(app)/o/[orgSlug]/` — tenant-scoped app pages
- `messages/{es,en}/` — i18n namespaces (structural parity enforced)
- `docs/verify/phase-N.md` — per-phase manual verification scripts

### Invariants worth knowing before contributing

1. Every mutating service calls `assertCan` (authz + read-only) and, for
   tier-gated modules, `assertOrgFeature`.
2. Money and quantities travel as strings; all arithmetic through
   `decimal.js`; servers recompute every total and never trust client math.
3. Offline mutations are idempotent by client-generated UUIDv7; replays
   return the existing row. Attendance collapses per (worker, day).
4. Inventory is a signed movement ledger; source rows link via
   `(ref_kind, ref_id)` with a partial unique index (replay-safe).
5. Read-modify-write denormalizations (activity machine cost, WO checklist
   jsonb, transfer stock checks) take row locks (`FOR UPDATE`).
6. Never trust client-supplied paths/ids for `revalidatePath` or org
   identity — derive from the validated context.
7. Since migrations 0011–0014 the DB enforces what the app promises:
   CHECK constraints mirror the TS enums on money-relevant state machines,
   composite `(org_id, id)` FKs block cross-org references, and deletes of
   entities with financial history are RESTRICTed (use the `active` flags —
   farms, parcels, workers, machines soft-deactivate; nothing hard-deletes).
   **Widening a CHECK-guarded enum now requires a migration** (drop +
   re-add the constraint) alongside the TS enum change — `pnpm db:generate`
   picks it up from the schema's `check()` definitions.
8. A constraint-violation error in production logs is an app bug the DB
   caught — alert on SQLSTATE 23xxx, don't ignore them.

## Deployment notes

- Postgres needs PostGIS (`postgis/postgis:16-3.4` matches CI/dev).
- Run `pnpm db:migrate` on deploy; the seed is for demo/dev environments.
- `pnpm build` uses webpack (Serwist has no Turbopack support); the SW
  excludes authenticated HTML/API responses from runtime caches by design
  (shared-device safety).
- The in-memory rate limiter and Better Auth rate limits are per-instance;
  put a shared limiter (or proxy limits) in front when scaling horizontally.
- **Row-level security (RLS)**: every tenant table enforces `org_id` at the
  DB layer (`drizzle/0017_app-role.sql`, `drizzle/0018_rls-policies.sql`),
  in addition to (not instead of) service-layer scoping — RLS is
  belt-and-suspenders, the app-layer `ctx.org.id` filtering on every query
  remains the primary control and must not be removed.
  - New env vars: `APP_DATABASE_URL` (the request-scoped, RLS-bound
    connection the app uses — `src/lib/db/index.ts` `db`) and
    `APP_DB_PASSWORD` (used only by `pnpm db:set-app-password`, which sets
    the `agropeq_app` role's password; never committed to a migration).
    `DATABASE_URL` remains the owner connection (`dbSystem`), which bypasses
    RLS and is used only for migrations, seed/cron scripts, the Stripe
    webhook, and org-identity bootstrap (see `src/lib/db/index.ts` for the
    full list and rationale).
  - After any migration that adds a table with an `org_id` column, run
    `pnpm db:verify-rls` — it fails (non-zero exit) and lists any table
    missing `ENABLE ROW LEVEL SECURITY` or a policy.
  - Seed and cron scripts (`pnpm db:seed`, `pnpm climate:ingest`) must run on
    the owner `DATABASE_URL` (they use `dbSystem` internally) — they
    intentionally span every org and have no per-request `app.org_id` to
    scope by.
  - `ALTER DEFAULT PRIVILEGES` (in `0017_app-role.sql`) is granted **by
    role**, not schema-wide: it only covers tables created by whichever
    Postgres role runs the migrations. If that role ever changes (e.g. a
    different CI/deploy user), re-run the two `ALTER DEFAULT PRIVILEGES`
    statements as the new role, or `pnpm db:verify-rls` will catch the gap
    on the next migration that adds an org-scoped table.
  - All request-scoped queries against RLS'd tables MUST go through
    `withOrgRls` (`src/lib/db/rls.ts`) — a query on the plain `db` client
    outside `withOrgRls` fails closed (returns zero rows / rejects writes)
    because `app.org_id` is never set.

Phase plan: Phases 0–8 complete (full Aragro-tier clone + PWA/offline,
billing & hardening, satellite climate). See `docs/verify/` for what each
phase guarantees and how to check it.
