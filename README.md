# AgroPeq

Farm-management SaaS (bilingual ES/EN) — crop traceability, activity & cost
tracking, parcel maps, and (in later phases) labor, inventory, harvest sales,
machinery, budgeting, and offline field capture.

## Stack

Next.js (App Router, TypeScript) · PostgreSQL + PostGIS (Drizzle ORM) ·
Better Auth (organizations plugin) · next-intl (es/en) · Tailwind + shadcn/ui ·
MapLibre GL + Terra Draw.

## Getting started

```bash
docker compose up -d db      # PostGIS on localhost:5433
cp .env.example .env         # fill BETTER_AUTH_SECRET
pnpm install
pnpm db:migrate
pnpm db:seed                 # demo org + data (idempotent)
pnpm dev
```

Demo login: `owner@demo.agropeq.io` / `demo1234` (also admin@, manager@,
supervisor@ — same password) → org **finca-demo**.

## Scripts

| Command | Purpose |
|---|---|
| `pnpm dev` | dev server |
| `pnpm db:generate` | generate Drizzle migration from schema |
| `pnpm db:migrate` | apply migrations |
| `pnpm db:seed` | deterministic demo seed |
| `pnpm test` | Vitest unit tests (cost calc, …) |
| `pnpm typecheck` | tsc --noEmit |

## Layout

- `src/lib/db/schema/` — Drizzle schema, one file per domain; every tenant table carries `org_id`
- `src/lib/tenancy.ts` — `requireOrgContext(locale, orgSlug)`: session + membership + role guard
- `src/lib/authz.ts` — role → permission checks (matrix in `src/lib/auth/permissions.ts`)
- `src/lib/calc/` — pure money math (unit-tested first)
- `src/server/services/` — business logic, always takes an `OrgContext`
- `src/server/actions/` — thin server actions (zod parse → service)
- `src/app/[locale]/(app)/o/[orgSlug]/` — tenant-scoped app pages
- `messages/{es,en}/` — i18n namespaces
- `docs/verify/` — per-phase manual verification scripts

Phase plan and architecture: Phases 0–8 (full Aragro-tier clone, then PWA/offline,
billing, and a CHIRPS climate integration). Currently: **Phase 0 + 1 complete**.
