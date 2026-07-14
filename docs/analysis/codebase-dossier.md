# AgroPeq — Codebase Dossier for Competitive Positioning

*Source: recovered multi-agent codebase analysis (28 payloads across 17 distinct dimensions, several run twice; 96 unique claims, 84 adversarially verified, 12 unverified). Verification status is flagged throughout: **[V]** survived adversarial code-reading, **[R]** refuted, **[U]** unverified. All file paths are relative to `/Users/jpalvarez/code/projects/agropeq.io/agropeq`.*

A recurring pattern in verification matters for reading this dossier: **the underlying mechanics almost always checked out, but grandiose comparative framings ("more rigorous than competitors," "genuine differentiator") were sometimes refuted as overclaims even when the code behind them is real.** Where that happened I note it explicitly — the capability is usually still present; only the "moat" label failed.

---

## 1. What the product IS — feature inventory with depth ratings

AgroPeq is a whole-farm ERP with 24 top-level modules and a 58-file route tree under `src/app/[locale]/(app)/o/[orgSlug]/**`, with real nested detail routes (`farms/[farmId]/parcels/[parcelId]`, `payroll/[periodId]`, `processing/lots/[lotId]`, `purchases/[purchaseId]/suppliers/[supplierId]`) — genuine ERP surface, not a flat page list (payload 27 F0). Service files are 285–488 lines with real domain logic, not CRUD stubs.

Depth ratings (Deep = real domain logic/state machines/money math; Medium = solid CRUD with guards; Shell = scaffold/stub):

| Module | Depth | Grounding |
|---|---|---|
| **Payroll / attendance / piecework** | **Deep** | `src/lib/calc/payroll.ts` `computePayrollEntry` (present=1/half=0.5/absent=0 days, overtime only on paid days, Decimal net), rate snapshots frozen at capture (`labor.ts` `dailyRateSnapshot`/`hourlyRateSnapshot`), open/closed period state machine (`services/payroll.ts:353-386`), 10 unit tests incl. hand-computed fortnight fixture. **[V]** |
| **Offline field-capture (PWA outbox)** | **Deep but narrow** | `src/lib/offline/outbox.ts` (single-flight flush, crash recovery, UUIDv7 idempotency), `api/sync/route.ts`, `services/work-orders.ts:297-351` (row-locked completion state machine). Only **5 mutation kinds** are offline-capable (`schemas.ts:127-133`). **[V]** |
| **Work orders** | **Deep** | `services/work-orders.ts:39-45` `ALLOWED_TRANSITIONS` enforced under `for('update')` lock; checklist-gated completion; `lib/calc/work-order-checklist.ts` monotone merge (never un-checks a peer's item), 8 unit tests. **[V]** |
| **Inventory / WAC costing / transfers** | **Deep** | `src/lib/calc/inventory.ts` pure decimal.js weighted-average fold surviving negative stock; `services/transfers.ts:75-137` `SELECT…FOR UPDATE` + insufficient-stock check; race-safe default-warehouse via partial unique index. **[V]** |
| **Crop cycles / parcels / GIS** | **Deep** | `crops.ts` taxonomy (crops→varieties→ordered phenological stages→cycles); DB-level `btree_gist` EXCLUDE constraint blocking same-crop/same-parcel overlap while allowing intercropping (`drizzle/0016`); real drawn PostGIS polygons via MapLibre + Terra Draw (`components/map/parcel-draw-map.tsx`). **[V]** |
| **Billing (Stripe)** | **Deep** | `services/billing.ts:112-182` idempotent webhook state machine with `FOR UPDATE` + `lastStripeEventAt` ordering guard + `stripeEvents` replay table; read-only degradation on past_due (`authz.ts:22-55`). **[V]** |
| **Tenant isolation (RLS)** | **Deep** | Native Postgres RLS on ~40 tables with fail-closed `org_id = current_setting('app.org_id',true)` policy, dedicated `NOBYPASSRLS` role (`drizzle/0017`), transaction-local GUC, automated coverage guard `scripts/verify-rls.ts`. **[V]** |
| **Machinery usage** | **Deep** | `services/machinery.ts:146-352` rate-snapshot immutability, decimal.js totalCost, locked bidirectional propagation into activity cost, `Decimal.max(...,0)` floor on delete. **[V]** |
| **Harvest → lot → processing → sales → profitability** | **Deep calc, thin wiring** | `lib/calc/profitability.ts` per-ha/per-unit margins, yield %, over-output warnings, Decimal throughout, worked fixtures. But profitability is **cycle-average, not lot-level COGS**; piecework unattributed; sales-to-cycle is an unvalidated manual tag. **[V]** |
| **Budget vs. actual variance** | **Deep calc** | `lib/calc/variance.ts:59-130` month×category matrix, unbudgeted/unspent detection, null%-on-zero-budget. Mechanics verified; "more rigorous than spreadsheets" framing **[R]** (overclaim, not error). |
| **Climate / satellite ingest** | **Medium-Deep** | `services/climate-ingest.ts` two real providers (Open-Meteo keyless + CHIRPS/ClimateSERV async poll), zod-validated, idempotent upsert, cron trust-boundary separation, source-priority merge. CHIRPS self-labeled "experimental." **[V]** |
| **Field monitoring (pest/disease)** | **Medium** | Well-modeled schema (severity 1-5 CHECK, GPS, photos jsonb), spatially integrated as severity-colored map pins. **No trend/alerting/outbreak logic**; photo upload UI is schema-only. **[V]** |
| **Localization (es/en)** | **Deep** | Spanish default, 31–32 namespaces at exact parity, regional units as enum values not just copy. **[V]** |
| **Map cockpit** | **Deep on dashboard / thin at `/map`** | `components/cockpit/map-cockpit.tsx` (669 lines) recolors real polygons by cost/ha, margin, crop, stage from live data (`reports/cockpit.ts`) **[V, payload 3]**. NOTE: payload 27 **[U]** claimed MapCockpit is unimplemented — this is contradicted by the verified payload-3 claim; the rich cockpit lives on the **dashboard**, while the dedicated `/map` route is a plain boundary viewer. |
| **Cost centers** | **Shell** | Full CRUD 2-level tree + `activities.costCenterId` FK, but **never joined by any report, budget, or profitability query** — a dangling dimension. **[V]** |
| **Data import/export** | **Shell-to-Medium** | CSV importer has real per-row `RowError` + audit + RLS (`actions/importer.ts`), but imports only products/parcels; exports only activities/products/parcels; zero financial-entity export. **[V]** |
| **Third-party API surface** | **Absent** | Only 4 routes (sync, export, auth, inbound Stripe), all session-cookie-gated; no API keys, no outbound webhooks, no FX feed. **[V]** |
| **Notifications / alerting / email** | **Absent** | Invite email is a `console.log` stub; zero email/SMS/push deps; no queue/cron; nothing evaluates severity/billing/stock thresholds. Everything is pull-only. **[V]** |

---

## 2. Inferred target market (from code evidence)

The seed data is not placeholder Lorem-ipsum — it encodes a specific customer with hand-computable, cross-checked financials. The evidence converges tightly:

- **Geography: Nicaragua, Central America.** Demo org `country: "Nicaragua"`, `timezone: "America/Managua"`, parcels geocoded to `~-85.92, 12.93` with comment "Matagalpa coffee country" (`seed.ts:199-206, 294`). **[V]**
- **Flagship crop: coffee smallholders.** Of 6 cataloged crops, only coffee and maize get operational fixtures; coffee gets 3 named regional cultivars (Caturra, Catuaí, Bourbon), `lata` harvest units, wet-processing (beneficiado húmedo, 678 lata→1560 kg pergamino→sold at $3.20/kg), and region-specific pest tracking (Broca del café, Roya/*Hemileia vastatrix*). **[V]**
- **Farm scale: smallholder to mid-size (10–50 ha).** Every seeded farm is under 50 ha (42.5 / 18.0 / 12.0 ha), parcels 3.9–6.0 ha — far below industrial ag-ERP scale. **[V]**
- **Labor market: day laborers / jornaleros.** Workers named by function (Cortadora, Peón, Jornalera, Capataz), daily wages $8–12/day, piece-rates per lata/surco — modeling informal Central American ag labor, not salaried W-2 staff. **[V]**
- **Institutional specificity:** input SKUs reference real formulations (Glifosato 35.6 SL, Cyproconazol 10 SL — a coffee-rust fungicide) and Nicaragua's INTA hybrid maize seed line. **[V]**
- **Currency:** `CURRENCIES` covers USD + NIO/GTQ/HNL/CRC/COP + MXN/EUR (`lib/currency.ts`); a second demo org runs on NIO (córdoba). **[V]**
- **Pricing:** three flat USD tiers named in Spanish crop-lifecycle metaphor — **Semilla $100/mo** (1 farm/2 users, core+monitoring+climate+map), **Cultivo $200/mo** (2 farms/5 users, +harvest/labor/payroll/inventory), **Cosecha $350/mo** (unlimited, +sales/machinery/budgets/warehouses/planning) (`plan-limits.ts:21-75`). Modest flat per-org pricing (not per-hectare/per-seat enterprise), positioned for small farms/cooperatives. **[V]**
- **Language:** Spanish-default (`routing.ts defaultLocale:"es"`); regional labor vocabulary (planilla not nómina, destajo, jornal, cortero) baked into TypeScript enums and variable names. **[V]**

**Inferred target: Nicaraguan/Central American smallholder-to-mid-size coffee farms and cooperatives (10–50 ha), operating in mixed USD/local currency, with day-labor/piecework crews and unreliable rural connectivity.**

---

## 3. Technical moats (differentiator claims that SURVIVED verification)

| Moat | Replication difficulty | Evidence |
|---|---|---|
| **DB-enforced RLS with fail-closed policies + NOBYPASSRLS role + automated CI coverage guard** | **High.** This is the single strongest verified moat. Native Postgres RLS on ~40 tables, transaction-local GUC preventing pool leakage, plus `verify-rls.ts` failing the build on any missing policy. Materially stronger than the common "shared tables + `WHERE org_id=?`" pattern a single missed clause defeats. Replicating requires deep Postgres RLS + connection-pool expertise. | `db/schema/helpers.ts:33-48`, `drizzle/0017`/`0018`, `db/rls.ts:27-35`, `scripts/verify-rls.ts` **[V]** |
| **Idempotent offline outbox with per-mutation-kind conflict resolution** | **High.** Not a generic retry queue: insert-or-noop creates (ON CONFLICT DO NOTHING on client UUID), last-write-wins attendance upsert, and a row-locked work-order state machine with a *monotone* checklist merge that never regresses a colleague's confirmed progress — backed by unit tests and a documented crash/replay verification (`docs/verify/workorder-offline.md`). | `services/work-orders.ts:297-351`, `lib/calc/work-order-checklist.ts`, `api/sync/route.ts` **[V]** |
| **DB-level crop-cycle temporal-overlap guard allowing intercropping** | **High.** A `btree_gist` EXCLUDE constraint blocks two cycles of the *same* crop overlapping on the same parcel/date-range while explicitly permitting intercropping — surfaced as a typed `CycleOverlapError`. Generic tools use a status enum with no temporal guarantee. | `drizzle/0016`, `crops.ts:84-92`, `services/cycles.ts:16-89` **[V]** |
| **Real drawn GIS parcel polygons (not pins)** | **Medium-High.** MapLibre + Terra Draw freehand tracing over satellite imagery, stored as PostGIS `geometry(Polygon,4326)`, marshalled via wkx GeoJSON↔EWKT. | `components/map/parcel-draw-map.tsx`, `db/geometry.ts`, `farms.ts:33-46` **[V]** |
| **Domain-native Spanish i18n (not translated-after-the-fact)** | **Medium-High.** Regional units (qq/lata/saco) and labor concepts (jornal/planilla/destajo/cortero) exist as **enum values and TypeScript variable names**, not just JSON copy; English adapts idiomatically (Cortero→Picker) and keeps units untranslated. An English-first competitor bolting on Spanish cannot cheaply replicate this. | `harvests.json` es/en parity, `reports/panel.ts:44-45` (`jornales` var), `harvest-form.tsx:17-19` **[V]** |
| **Purpose-built day-laborer/piecework payroll engine** | **Medium-High.** Attendance-status-driven day fractions, overtime-on-paid-days-only, piece-rate×quantity, frozen rate snapshots, period-lock state machine — vs. US/EU software that assumes salaried staff. | `lib/calc/payroll.ts`, `services/payroll.ts`, `labor.ts` **[V]** |
| **Idempotent Stripe webhook state machine** | **Medium.** Out-of-order protection (`lastStripeEventAt` + row lock), replay idempotency (`stripeEvents`), org resolution never trusting webhook metadata. Good engineering but a known-good pattern. | `services/billing.ts:112-182`, `webhooks/stripe/route.ts:61-88` **[V]** |
| **Satellite/reanalysis climate ingestion** | **Medium.** Two real providers (Open-Meteo + CHIRPS) with idempotent upsert and cron trust-boundary separation — vs. manual-weather-entry competitors. CHIRPS self-labeled experimental. | `services/climate-ingest.ts` **[V]** |
| **Machinery usage as a cost-accounting ledger** | **Medium.** Rate-snapshot immutability + locked bidirectional propagation into activity totals. | `services/machinery.ts:146-352` **[V]** |
| **WAC inventory costing with transfer concurrency safety** | **Medium.** Pure decimal.js weighted-average fold + row-locked value-preserving transfers. | `lib/calc/inventory.ts`, `services/transfers.ts:75-137` **[V]** |
| **Decimal-precise money math, unit-tested** | **Medium.** decimal.js throughout `lib/calc/*` with explicit float-drift regression tests. Rounding bugs are a common competitor failure mode. | `tests/unit/{payroll,inventory,profitability,variance}.test.ts` **[V]** |

**Framings that did NOT survive as moats (mechanics real, comparative claim refuted):** service-layer feature-gating as "meaningfully harder-to-bypass than competitors" **[R, payload 21]** (though the plain "enforced server-side" version SURVIVES in payload 2); audit log as a "compliance-trail differentiator competitors skip" **[R, payload 20]** (mechanics real and even stronger than cited, but overclaimed); offline-schema testing as "more mature than typical SaaS" **[R, payload 19]**; variance engine as "more rigorous than spreadsheets" **[R, payload 4]**. Use these as *capabilities present*, not as *defensible moats*.

---

## 4. Verified weaknesses and maturity gaps

**Maturity verdicts by dimension** (merged across re-runs):

| Dimension | Maturity |
|---|---|
| Localization (i18n) | **Production-ready** |
| Tenant isolation / RLS / audit | **Production-ready** (undercut: identity tables outside RLS) |
| Offline outbox | Functional-but-thin → production-ready *within its narrow 5-kind scope* |
| Billing / plan-gating / money-math | Functional-but-thin, production-ready on the Stripe state machine |
| Crop/parcel/harvest agronomic | Functional-but-thin → production-ready on core mechanics |
| Operational execution (WO/machinery/climate/monitoring) | Functional-but-thin (WO+machinery+climate strong; monitoring scaffolded) |
| Inventory / purchasing / warehousing | Functional-but-thin, production-ready costing core |
| Labor / payroll | Functional-but-thin, uneven (cost-allocation half-wired) |
| Sales→profitability chain | Functional-but-thin |
| Seed data / roadmap | Functional-but-thin (deep in coffee vertical only) |
| Test coverage | Functional-but-thin (narrow slice production-grade; **zero e2e**) |
| Data portability | Functional-but-thin (narrow to misleading) |
| Integration / API surface | **Scaffolded / essentially absent** |
| Notification / alerting / email | **Scaffolded / absent** |
| Module breadth (ERP claim) | Functional-but-thin, unevenly distributed |

**Verified weaknesses (all [V] unless noted):**

- **Zero automated e2e/integration tests anywhere.** Entire suite is 9 files / ~70 pure-function unit tests. Nothing verifies RLS boundaries, the sync route, Stripe webhooks, or Better Auth end-to-end at runtime — confidence rests on manual browser sessions (the `.playwright-mcp/` cache). Sales, purchases, machinery, piecework, transfers — all money-touching with real Decimal logic — have **no tests at all**. Material diligence risk. `package.json` test script is just `vitest run`. (payloads 8, 19)
- **No notification/alerting system of any kind.** No email/SMS/push provider, no queue, no cron substrate. Invite email is a `console.log` TODO stub (`lib/auth/index.ts:41-56`). Billing past_due, rising pest severity, low stock — all pull-only badges a user must navigate to. (payload 15)
- **No third-party integration surface.** Only 4 API routes, all browser-session-gated; no API keys/tokens, no outbound webhooks. A QuickBooks/contabilidad system, bank, or ERP cannot connect without manual CSV. (payload 14)
- **Data portability is narrow to the point of lock-in.** Import: products/parcels only. Export: activities/products/parcels only (parcels export unlinked in UI). **Zero export of harvests, sales, payroll, or inventory** — no accountant-facing data-out path. The `importJobs` schema even permits an `activities` type no code implements (abandoned partial feature). (payload 13)
- **Cost centers are decorative.** Full CRUD + FK on activities, but never joined by any budget, variance, or profitability query. (payloads 4, 23)
- **Profitability is cycle-average, not lot-level COGS.** Sales link to a cycle only via an unvalidated manual tag; no join from harvest lot → processing run → sale. Piecework cost is structurally excluded per-cycle (shown as an org-wide footnote) because `pieceworkEntries` has no `crop_cycle_id`. The flagship profitability report understates true per-cycle cost whenever piecework is used. (payloads 4, 23)
- **WAC valuation is disconnected from activity/profitability costing.** Input unit cost on activities is a manually re-typed free-text field, never pre-filled from `getStockByProduct`'s real weighted average — so reported P&L can silently diverge from inventory value. (payloads 16, 25)
- **Labor cost-allocation half-wired.** `activityLabor.workerId` exists but `createActivityInTx` never sets it (UI is free-text worker name) → duplicate data entry between payroll and activity costing. Piecework in the activity-cost path is an admitted stub falling back to daily-rate math. `workers.type` (fixed/temporary — legally meaningful in CA labor law) is inert. (payload 11)
- **RLS perimeter has a real seam.** Better Auth's `organization`/`member`/`invitation`/`session` tables sit **outside** RLS, protected only by hand-written filters with no `verify-rls.ts` backstop; invite acceptance is fully outsourced to the Better Auth library (unauditable from this repo); no behavioral cross-org isolation test exists. (payloads 10, 20)
- **Offline is a narrow vertical slice.** Only 5 of ~24 modules are offline-capable; the SW deliberately does not cache authed pages; conflict resolution is **discard-only** (no edit/retry/merge) — a rejected field write must be redone from scratch. Audit trail for offline completions is at-most-once (disclosed). (payloads 1, 22, 27)
- **Monitoring/climate have no derived agronomic intelligence.** No GDD/phenology model, no pest-pressure trend, no rainfall-driven spray/irrigation advisory, no threshold alerts. "Well-engineered data capture," not decision support. (payloads 6, 24)
- **Pricing/FX mismatch.** Despite modeling NIO/GTQ/HNL/CRC natively, Stripe checkout is **USD-only** (`stripe.ts:9-13`), and all FX is **manual entry** with no live rate feed — a trust/localization gap for a cross-border product. (payloads 2, 21, 14)
- **Product catalog has no edit/delete; `minStock` low-stock badge is dormant** (no write path). (payload 25; minStock-dormant is **[U]**)
- **Thin onboarding funnel** (single form) drops users into 24 empty modules with no guided setup or import wizard. (payload 27, **[U]**)

**Load-bearing refuted "weakness" claims — the product is STRONGER than these claimed:**
- *"Isolation is app-layer only, RLS deferred"* — **REFUTED 3/0.** `drizzle/0018` enables real DB-level RLS on 30+ tables. The `phase-7.md` "RLS deferred" note was accurate *at Phase 7* but later phases shipped it. **RLS is a real moat, not a gap.**
- *"No reorder-point concept exists at all"* — **REFUTED 1/0.** `catalog.ts:51` defines `minStock`. (But it is dormant/unsettable in practice — the softer weakness holds.)

---

## 5. What the code says about the team's priorities

- **Correctness before polish.** Git history mirrors 8 functional phases (auth/tenancy → offline PWA → labor/payroll/inventory → equipment/planning/budgets → processing/sales/profitability → billing/hardening → satellite climate) with a **single Phase 9 design pass applied last**. Domain depth was built before any dedicated UI system existed. (payloads 9, 26 — **[U]** on sequencing narrative but corroborated by git log)
- **Money math is sacred.** decimal.js is used exclusively across every calc module, with explicit float-drift regression tests and hand-verified fixtures reconciled against `docs/verify/*.md`. The team tested precisely the modules they most feared getting wrong (payroll, inventory valuation, profitability, offline sync) — a targeted-risk posture, not a coverage program. (payloads 8, 19)
- **Regional authenticity over generic breadth.** Seed data, i18n enums, pest names, and labor vocabulary are Nicaragua-coffee-specific to a degree a horizontal ag-ERP would never encode. The team chose depth in one vertical over shallow multi-crop breadth (only 2 of 6 crops have operational fixtures). (payloads 7, 17, 18)
- **Field connectivity treated as a first-class architectural constraint** — a documented, incident-hardened offline layer ("verified 2026-07-05: crash + zombie replay + 5 redundant flushes → 8 rows/8 distinct ids") rather than a PWA checkbox. (payloads 9, 22)
- **Security-conscious for a young product** — fail-closed RLS, an automated coverage guard, PII-masked audit log, shared-device cache exclusion, read-only billing degradation. Notable maturity signals.
- **Design language is deliberate and unusual:** a Palantir-Foundry/Gotham dense-data-ops aesthetic (1px borders, no shadows, tabular mono numerals, semantic-color-only), with an explicit **Office-dense × Field (48px touch targets) mode axis** for gloved outdoor use — implemented as real CSS density tokens (`globals.css`, `mode-toggle.tsx`). (payloads 9, 11, 26)
- **Consistent deferrals reveal what was deprioritized:** notifications/email, a public API, comprehensive data export, live FX, agronomic analytics/alerting, and e2e testing were all left as stubs or absent. The team optimized for a *trustworthy transactional core for one regional customer* over *platform breadth, integrations, and go-to-market surface*. The gap between the "whole-farm ERP for field and office" positioning and the shipped reality (19 of 24 modules are desk-only, online-only) is the clearest strategic tension in the codebase. (payloads 14, 15, 27)

*Note on the recovered file: it contained a scope result (dimension briefs) and a "missing" list flagging under-examined areas (the procurement/WAC chain and CSV portability), both later covered by dedicated re-runs. No separate critic payload was present; the `verdicts` map is itself the adversarial-verification output. 12 claims (mostly in payloads 16, 26, 27) were left unverified and are flagged **[U]** above.*
