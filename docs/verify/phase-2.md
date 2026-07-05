# Phase 2 verification

Setup as in phase-1.md (`docker compose up -d db`, `pnpm db:migrate && pnpm db:seed`, `pnpm dev`).
Seed adds: plans (semilla/cultivo/cosecha), finca-demo on a Cosecha trial, org **vecino-sa**
(owner `vecino@demo.agropeq.io` / `demo1234`) on an active Semilla plan with 1 farm,
3 monitoring records, 90 days of climate readings.

## Click-through (as owner@demo.agropeq.io, org finca-demo)

1. **Monitoreo**: 3 seeded records (Broca severity 3, Roya severity 4 — red chip, Coyolillo).
   Create a record on Lote El Cedro tied to the coffee cycle; delete it.
2. **Clima**: rainfall bar chart + temp min/max lines for Finca La Esperanza (90 days).
   Switch farm pills; add a manual reading for today; re-enter the same date → updates
   instead of duplicating.
3. **Centros de costo**: create root "Riego", then a child under it; both render as a tree.
4. **Órdenes de trabajo**: create one assigned to Samuel Supervisor → status Asignada →
   Iniciar → as supervisor@ log in and see only the "Completar" button → complete it.
   Codes increment OT-0001, OT-0002… even after deletes.
5. **Actividades → Registrar actividad**: new Currency select (defaults USD) and Centro de
   costo select. Pick NIO with no rate configured → error. Go to **Configuración →
   settings/currencies**, add NIO rate 0.0274 valid today, retry → saves; dashboard total
   rises by the base-converted amount.
6. **Exportar CSV** on Actividades and Productos → downloads open in Excel with accents intact.
   **Importar CSV** (products): file with a bad row → row imported count + per-row errors in
   history; a bad `area_ha` in parcels CSV is a row error, not a crash.
7. **Plan y límites** (`/settings/plan`): shows Cosecha (trial), usage counters, three tier
   cards with Cosecha highlighted.

## Plan limit enforcement (as vecino@demo.agropeq.io, org vecino-sa)

8. Fincas → create a second farm → redirected to Plan page with the maxFarms warning.
9. Miembros → invite two people → second invite redirected with maxUsers warning
   (pending invites count toward seats).

## Tenant isolation

10. As vecino@, visit `/es/o/finca-demo/dashboard` → redirected to onboarding.
    finca-demo data (parcels, cycles, monitoring) never appears in vecino-sa lists.

## Automated

`pnpm test` (9 tests) · `pnpm typecheck` · `pnpm build` — all green as of Phase 2 close.
Opus review applied: cross-org FK validation on all create paths (activities, monitoring,
work orders, cost centers), invite action re-anchored on requireOrgContext, work-order
codes unique per org with server-side status transitions, importer transactional with
numeric validation, exchange-rate input validation.
