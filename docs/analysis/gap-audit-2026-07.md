# AgroPeq Product Gap Audit

_Bilingual farm-management SaaS for Central American smallholder & estate coffee. Synthesis of six domain audits (Labor/Payroll, Agronomy/Field Ops, Money Loop, Billing/Monetization, Offline/Mobile UX, Reporting/Integrations), deduplicated and re-scored for the coffee-smallholder segment._

Repo: `/Users/jpalvarez/code/projects/agropeq.io/agropeq` · Branch: `feat/money-loop` · Date: 2026-07-14

---

## 1. Executive Summary — the holes that matter most

**1. Harvest-crew capture doesn't exist, and harvest is the whole business.** Attendance and piecework are modeled one-entry-per-worker, but the dominant field reality is a _mandador_ logging picks for a whole _cuadrilla_ of pickers who don't own smartphones. There is no crew/foreman batch-entry flow anywhere in `src/` (no `foreman/mandador/crew/cuadrilla` matches; `attendance-grid.tsx` and `piecework-entry-form.tsx` are single-worker). PickTrace, FieldClock, and HeavyConnect all lead with checker/foreman group entry. Without it, AgroPeq cannot be adopted during the one season it most needs to work. **Critical.**

**2. The flagship "offline capture works" promise breaks on the most common real-world path.** Two compounding holes: (a) a phone that was off overnight and opens the app cold on a zero-signal hillside gets nothing — no `offline.html` or app-shell fallback in `sw.ts`, and authed HTML is (correctly) excluded from the SW cache, so first navigation offline simply fails; (b) the `refCache` Dexie table for parcels/workers/activity-types is declared but never read or written, so capture-form dropdowns are empty on any load that wasn't freshly server-rendered while online. Individually each is critical; together they mean offline capture is reliable only in the lab, not the field. **Critical.**

**3. No statutory wage floor on piece-rate pay — a live legal and certification exposure.** Piecework is pure `quantity × rateSnapshot` with no comparison to the local statutory daily minimum wage, and overtime is a flat multiply with no statutory multiplier tables. Regional labor law and Fairtrade / C.A.F.E. Practices audits both require topping piece-rate pickers up to minimum wage on slow days. Today AgroPeq either silently underpays (compliance/legal risk) or forces a manual off-system top-up that never reaches the profitability report. PickTrace's Wage Engine and HeavyConnect's Timekeeper auto-blend this. This is the single most common source of real wage-law liability in ag piece-rate payroll. **Critical.**

**4. AgroPeq has no certification/compliance layer — the reason specialty coffee buys software at all.** For this segment, certification premiums are frequently the _entire_ economic case, and the codebase has essentially nothing purpose-built: no Fairtrade/RA/organic/C.A.F.E. scorecard (200+ indicators), no spray/application record with applicator/rate/re-entry interval, no re-entry-interval safety hold blocking labor assignment to a freshly-sprayed parcel, no certification-document attachments on farm/lot, and no certifier-facing chain-of-custody report — even though the harvest→lot→processing→sale lineage schema already exists to feed one. Cooperatives lose days per audit cycle reassembling this by hand. This is the highest-value differentiator named across three separate domain audits. **Critical (as a cluster).**

**5. The money loop is half-open: outputs aren't inventory.** `inventoryMovements.type` declares `harvest_in`, but nothing ever writes it. Coffee output (parchment, then green) never enters the weighted-average-cost ledger, so there is no finished-goods valuation, no link between quintales harvested/processed and quintales sold, and no way to catch shrinkage or reconcile against what a cooperative/exporter says it received. Inputs are tracked rigorously; outputs are free text on a sale line. This undermines the core "sell in quintales the exporter recognizes" table-stakes item. **Critical.**

**6. The org model is single-tenant-per-farm, but most Central American coffee moves through cooperatives.** There is no producer/member entity distinct from `worker`, no member-farm→coop→export-lot rollup, and no per-member settlement/advance tracking. This is structurally absent (no `cooperative/member.*advance` matches) and blocks the dominant commercial and financial structure the target segment actually operates within (FEDECOCAGUA-style federations, member-credit/advance settlement). Large effort (months), but strategically decisive. **High, trending critical for the coop go-to-market.**

**7. Payment can't reach much of the target market.** `createCheckoutSessionAction` goes straight to Stripe Checkout, and Stripe is not a direct merchant-of-record in Nicaragua, Honduras, or Guatemala. Local-currency price _display_ is a nice mitigation, but card penetration among smallholder producers is low and there's no alternate rail (Pagadito, dLocal, bank transfer, QR). You can build the best product in the segment and still be unable to collect from it. **Critical for monetization** (though it gates revenue, not field usefulness).

**8. There's no accounting bridge and no worker-facing pay artifact.** The role model stops at `field_supervisor` with no read-only accountant/contador seat, so a bookkeeper must be handed full manager access or a manual export. There is no QuickBooks/Xero/GL-mapped export (only flat operational CSVs), no PDF/letterhead report for a bank or certifier, and — on the worker side — the "Ver recibos" control is a dead end with no payslip route or per-period wage statement a picker can review or sign. For a workforce that is often illiterate or non-Spanish-speaking, the missing wage statement is both a dispute risk and a documented UI dead-end. **High.**

---

## 2. Gap Table (all domains, deduplicated, re-scored)

Severity reconciled for the coffee-smallholder segment; US-broadacre-only concerns dropped or capped. "Effort" is a rough build estimate.

| # | Gap | Domain(s) | Severity | Effort | What leaders do |
|---|-----|-----------|----------|--------|-----------------|
| 1 | No crew/foreman (_mandador_) group-entry mode | Labor | **Critical** | weeks | PickTrace, FieldClock, HeavyConnect lead with checker/foreman group entry |
| 2 | Offline cold-start broken — no app-shell/`offline.html` fallback | Offline | **Critical** | days | CommCare/ODK precache an app shell so the app always opens |
| 3 | Reference data (parcels/workers/activity types) never cached offline (`refCache` unused) | Offline | **Critical** | weeks | Agworld, AgriWebb, CommCare, FarmQA cache lookup data locally |
| 4 | No minimum-wage top-up / statutory OT multiplier on piece-rate | Labor + Money | **Critical** | weeks | PickTrace Wage Engine, HeavyConnect, Croptracker, FieldClock auto-blend to wage floor |
| 5 | Finished-goods inventory: `harvest_in` declared but never written; sales don't decrement stock | Money | **Critical** | weeks | Conservis/Traction, Granular, Croptracker track output field-to-sale |
| 6 | No certification/audit scorecard (Fairtrade/RA/organic/C.A.F.E. 200+ indicators) | Agronomy + Reporting + Billing | **Critical** | weeks | Agworld audit-ready records; SCS/C.A.F.E. Practices scorecard; CoffeeTrace |
| 7 | No spray/application compliance log + re-entry-interval (REI) safety hold on labor assignment | Money + Agronomy | **Critical** | weeks | Croptracker links spray records to worker location for REI; Folio3, Crop Analytica |
| 8 | No LATAM payment rail beyond Stripe card (no Pagadito/dLocal/bank/QR) | Billing | **Critical** | weeks | Pagadito (GT/HN/NI/SV/CR/PA), CoralCommerce, dLocal orchestration |
| 9 | No cooperative/multi-producer member entity + settlement/advances | Agronomy + Billing | **High** | months | CoffeeTrace models producer-org planning; federations require it |
| 10 | No lot traceability artifact (QR / certifier chain-of-custody report/export) | Agronomy + Reporting | **High** | weeks | Cropster Origin, CoffeeTrace ship shareable lot documents; Croptracker recall reports |
| 11 | No worker wage statement / payslip + e-acknowledgment (dead "Ver recibos") | Labor | **High** | weeks | PickTrace, HeavyConnect ship wage statements; DOL #26F effectively requires |
| 12 | No statutory social-security deduction schema (CCSS/IHSS/INSS) | Labor | **High** | weeks | ADP/QuickBooks payroll handle statutory withholding natively |
| 13 | No accountant/bookkeeper scoped (read-only) role | Reporting | **High** | weeks | Figured shares one dataset across farmer/accountant/bank with scoped access |
| 14 | No accounting-system export/import (QuickBooks/Xero/GL mapping) | Reporting | **High** | months | Figured↔Xero CoA sync; Conservis↔CenterPoint import |
| 15 | No accounts-receivable / payment status on sales (partial pay, advances, settlement lag) | Money | **High** | weeks | Figured, FarmERP treat AR/AP as baseline bookkeeping |
| 16 | No GPS/geo-stamp on attendance/piecework capture | Labor | **High** | weeks | FieldClock, PickTrace geo-stamp every punch |
| 17 | No offline photo/document capture (certifier/lender evidence) | Offline | **High** | weeks | Croptracker, Agworld queue photos locally, upload later |
| 18 | No certification-document attachments on farm/lot records | Billing | **High** | weeks | SourceTrace; general Fairtrade/organic doc workflow |
| 19 | No PDF/printable professional report for banks/landlords/certifiers | Reporting | **Medium** | weeks | Conservis: bank/landlord/insurer-formatted reports |
| 20 | Cost-by-category / cost-by-month reports fully built but unreachable (dead code) | Money | **Medium** | days | FarmERP, Figured, Agrivi surface category + month trend as standard |
| 21 | Cost centers captured on activities but never surfaced in any report/export/filter | Money | **Medium** | days | Conservis, Granular slice any cost/margin report by management unit |
| 22 | No rain-day / non-productive-time (NPT) compensable category | Labor | **Medium** | weeks | PickTrace, HeavyConnect track NPT at minimum wage |
| 23 | "Map cockpit" implied by repo PNGs is unwired/missing from `src/` | Agronomy | **Medium** | days | n/a — internal discrepancy flag |
| 24 | No PPP-adjusted base pricing (only market-FX conversion) | Billing | **Medium** | weeks | Spotify/Slack PPP; 30–60% emerging-market discounts |
| 25 | No seasonal/harvest-elastic seat scaling (flat annual `maxUsers`) | Billing | **Medium** | weeks | Open gap even among leaders — differentiation opportunity |
| 26 | No true Background Sync API — flush dies with the tab | Offline | **Medium** | weeks | AgriWebb markets "Enable Background Sync" |
| 27 | Concurrent-edit conflicts silently last-write-wins, no user signal | Offline | **Medium** | weeks | CommCare/offline-first guidance treats conflict surfacing as core |
| 28 | No custom PWA install prompt / add-to-home-screen UX | Offline | **Medium** | days | Standard for low-end-Android field PWAs |
| 29 | No child-labor age gating at worker onboarding | Labor | **Medium** | days | Harvust ID-scan onboarding builds the paper trail |
| 30 | No worker contract/document-expiry tracking (only free-text `documentId`) | Labor | **Medium** | weeks | Ganaz, Harvust track contract metadata on the worker record |
| 31 | No worker profile / rolled-up history view | Labor | **Medium** | days | Baseline across Ganaz/FieldClock/HeavyConnect profiles |
| 32 | Wet-mill/dry-mill process staging + yield-conversion analytics shallow | Agronomy | **Medium** | weeks | Cropster Origin tracks cherry→parchment→green + defects/grade |
| 33 | No public API / outbound webhooks | Reporting | **Medium** | months | Agworld, Conservis expose partner APIs; Farmbrite↔Zapier |
| 34 | No cost-per-quintal (cost/qq) KPI (only cost/ha, margin%) | Reporting | **Low** | days | Coffee cost-of-production is benchmarked in cost/qq or cost/lb |
| 35 | Payroll close is one-way, no reopen/correction path | Labor | **Low** | days | Not benchmark table-stakes; operational risk |
| 36 | No scheduled export delivery to the contador's inbox | Reporting | **Low** | days | Figured/Xero push continuously vs manual pull |
| 37 | No tax/VAT (IVA) on sales/purchases (`// No tax in Phase 6`) | Money | **Low** | weeks | FarmERP, Figured build VAT into invoicing |
| 38 | No negative-stock/overselling guard on input consumption | Money | **Low** | days | Agrivi, Croptracker, Folio3 validate at entry (deliberate trade-off here) |
| 39 | No nonprofit/smallholder discount program | Billing | **Low** | days | Farmbrite: up to 65% nonprofit discount |
| 40 | No anti-arbitrage binding on local-currency pricing | Billing | **Low** | days | PariDeals/Monetizely tie PPP to verified address/payment method |
| 41 | Inconsistent offline-provenance tagging (`createdOffline`) across kinds | Offline | **Low** | days | Provenance implied by EUDR/traceability tooling |
| 42 | Outbox attempts/error counters write-only; no backoff, no UI surfacing | Offline | **Low** | days | AgriWebb/Croptracker honest per-record sync status |
| 43 | Mixed-currency worker rates within one payroll period silently mis-total | Labor | **Low** | days | Not a named segment item (single-currency farms are the norm) |
| 44 | No lender/microfinance composite report (volume+grade+price in one artifact) | Money + Billing | **Low** | weeks | Premium/emerging even among leaders; differentiator if built |
| 45 | No satellite NDVI / AI pest-disease (roya/broca) image diagnosis | Agronomy | **Low** | months | xarvio Field Manager — low signal on shade-canopy plots |
| 46 | Livestock/herd module absent | Agronomy | **Low** | months | Farmbrite — _out of scope for export coffee; noted, not recommended_ |

---

## 3. Per-Domain Detail

### 3.1 Labor & Payroll
The strongest-built domain, with genuinely differentiating internals (server-side net recompute, rate snapshotting, RLS, cost-center attribution) — but it is missing the two things that decide whether a coffee operation can use it at all: **crew group entry (#1)** and a **statutory wage floor (#4)**. Both are critical and both are absent by inventory confirmation. The next tier is worker-facing and compliance paperwork: **payslips (#11)**, **statutory social-security fields (#12)**, **GPS geo-stamp (#16)**, and audit-defense items (**NPT/rain-day #22**, **child-labor gate #29**, **contract tracking #30**). The **worker profile history view (#31)** is a cheap UX win that also serves dispute resolution. **Payroll reopen (#35)** and **mixed-currency-period mis-total (#43)** are low-severity operational edges. Note the wage floor (#4) also appears in the Money domain — treat it as one build, owned by Labor, that must write back into the profitability report's labor cost.

### 3.2 Agronomy & Field Ops
Excellent data-integrity foundations (DB-level crop-cycle overlap `EXCLUDE` constraint, PostGIS server-side `ST_Area/ST_IsValid`, FX-snapshotted costs). The domain's defining gap is **compliance (#6, #7, #10)**: no certification scorecard, no spray/REI record, no buyer/certifier traceability artifact — despite the lineage schema existing to power the last one. **Cooperative aggregation (#9)** is the big structural gap shared with Billing. **Processing staging/yield-conversion (#32)** is shallow (one generic input/output row, no washed/natural/honey method, no defect/grade) — medium because it drives export grade and price. The **map cockpit (#23)** is an internal discrepancy: three `map-cockpit-*.png` files sit in the repo root (visible in git status) with no matching route/component, and `geo.ts` centroid helpers are consumed only by climate-ingest — likely reverted or half-built work field managers may expect. **NDVI (#45)** and **livestock (#46)** are correctly low/out-of-scope for shade-canopy export coffee.

### 3.3 Money Loop & Profitability
The per-cycle profitability pipeline (sales + activities + processing + piecework + FX normalization) is genuinely complete end-to-end, and WAC input-inventory valuation is rigorous. The glaring hole is that **finished goods are never inventoried (#5)** — the `harvest_in` movement type exists but has no writer, so there's no yield reconciliation and no finished-goods costing. **AR/payment status (#15)** is the other bookkeeping gap: sales post as fully realized cash the instant they're entered, which overstates cash position for a segment that runs on advances and post-delivery settlement. Two **near-zero-effort wins** sit here: cost-by-category/month reports are fully built and tested but have **zero callers (#20)**, and **cost centers (#21)** are a write-only taxonomy never surfaced downstream. The **minimum-wage top-up (#4)** is shared with Labor. **VAT (#37)** and the **negative-stock guard (#38)** are deliberate low-severity deferrals.

### 3.4 Billing & Monetization
Local-currency Stripe checkout with a 7-day rate-freshness window and dated, locked historical FX rows is genuinely ahead of every named competitor. But the **payment rail itself (#8)** is critical: Stripe can't act as merchant-of-record in NI/HN/GT, so local-currency _display_ doesn't solve collection for card-poor smallholders. **Cooperative model (#9)** and **certification-doc management (#18)** are the high-severity structural/compliance gaps (shared with Agronomy/Reporting). **PPP pricing (#24)** deserves attention: a flat $100–350/mo USD-equivalent, unadjusted for cost of living, risks being 2–3× a reasonable Nicaraguan/Honduran software budget versus Farmbrite's $19–95 entry tier — affordability is close to existential here, so this is a firm medium leaning high. **Seasonal seats (#25)** is a differentiation opportunity (no leader solves it). **Nonprofit discount (#39)** and **anti-arbitrage binding (#40)** are low; the latter should ship _with_ any future PPP discount.

### 3.5 Offline / PWA & Mobile Field UX
Impressive rigor where it exists — idempotent dup-detecting sync with a real Postgres integration/e2e suite, deliberate exclusion of authed HTML from the SW cache (a real security call for shared coop phones), UUIDv7 idempotency keys, localized rejection-reason codes. The problem is that two **critical** holes sit directly downstream of that good security decision: **no app-shell fallback (#2)** and **unused reference-data cache (#3)** together mean the app fails exactly in the cold-start, zero-signal scenario the product is sold on. **Offline photo capture (#17)** is high (certifier/lender evidence). Then a cluster of medium reliability gaps: **no Background Sync (#26)** (flush dies with the tab), **silent last-write-wins conflicts (#27)** on attendance that feeds wages, and **no install prompt (#28)**. Low-severity polish: **inconsistent `createdOffline` tagging (#41)** and **write-only attempts counters with no backoff/UI (#42)**.

### 3.6 Reporting, Exports & Integrations
The CSV export is genuinely accountant-grade (Decimal-string money, RFC-4180 escaping, decimal.js FX conversion — no float coercion), multi-currency is systemic, and the digest/email pipeline is real and tested. The gaps are about _who_ and _what format_: **no scoped accountant role (#13)**, **no QuickBooks/Xero/GL export (#14)**, **no certifier chain-of-custody report (#10, shared with Agronomy)**, and **no PDF/printable output (#19)** for banks/certifiers. **Public API/webhooks (#33)** matters mainly at coop-aggregation scale. Two quick wins: **cost/quintal KPI (#34)** (derivable from existing fields) and **scheduled export delivery (#36)**.

---

## 4. Strengths — where AgroPeq genuinely beats the field

I've kept only claims that hold up against the cited evidence and that are actually differentiating (not table-stakes done competently). Where a "strength" is really just competent execution of a baseline, I've said so.

**Genuinely ahead of named competitors:**
- **Idempotent, dup-detecting offline sync with documented replay semantics** (`outbox.ts`, `api/sync/route.ts`, UUIDv7 keys shared client/server via Zod, explicit `applied` vs `duplicate` status, backed by a real Postgres integration/e2e suite). Most competitors claim "offline mode" without publishing replay-safety guarantees. This is the strongest differentiator in the codebase — _provided_ gaps #2/#3 are closed so it actually reaches the field.
- **Local-currency LATAM checkout with locked historical FX** (`plan-pricing.ts`, `orgExchangeRates` with `uniqueIndex(orgId, currencyCode, validDate)`, 7-day freshness with safe USD fallback). No named competitor publishes local-currency LATAM checkout. Real, and rare.
- **Server-side net recomputation on payroll** — client `netAmount` is never trusted (`payroll.ts:273-351`), closing a wage-and-hour bug class competitors don't advertise fixing.
- **Rate snapshotting at capture time** for attendance and piecework, so later tariff edits never rewrite historical pay. Correct-by-construction; many tools get this wrong.
- **DB-level crop-cycle overlap `EXCLUDE` constraint** (`0016_crop-cycle-overlap-guard.sql`) that still allows intercropping — enforced in Postgres, not app logic, which holds under concurrent field-staff edits.

**Strong foundations (better than the smallholder-tier norm, but closer to table-stakes):**
- Per-org **Postgres-level RLS** across every labor table with composite FKs preventing cross-tenant piece-rate references — stronger than the app-layer checks typical of this tier.
- **PostGIS server-side area/validity** (`ST_Area/ST_IsValid`) instead of client-trusted polygon math — reduces bad-hectare data on unsurveyed plots.
- **Weighted-average-cost input inventory** with transfer cost-snapshot carry-over — more rigorous than badge-only stock tracking. (Caveat: it's only half an inventory system until finished goods #5 exist.)
- **Accountant-grade decimal-safe CSV export** with base-currency conversion — genuinely reconciles to the centavo. (Caveat: CSV-only; no PDF/GL egress, gaps #14/#19.)
- **Feature-gated plans enforced at the mutation layer** (`assertOrgFeature` throws on direct POSTs/sync items, not just UI redirects) — tighter than UI-only gating.
- **Complete per-cycle profitability pipeline** and **budget-vs-actual tracking** — the core cost-of-production/breakeven capability is real end-to-end, not a mock.

**One honesty note:** several audits describe the harvest→lot→processing→sale traceability chain as a strength. The _schema_ is real and RESTRICT-deletes protect ledger history — but with no report/export consuming the full chain (#10) and no finished-goods movements (#5), that lineage is currently invisible to the commercial and audit use cases that would value it. It's a strong foundation, not yet a shipped capability.

---

## 5. Suggested Sequencing — what to `/orchestrate` next

Runs A–D are done (FX feed + local checkout, CSV exports + digest, offline capture + retry queue, integration/e2e suite). Continuing the pattern, grouped so each run is a coherent, testable slice with a clear user outcome. Ordering favors **harvest-season adoption first**, then **wage/compliance liability**, then **the money loop and accounting bridge**, with the two multi-month structural bets sequenced last.

**Run E — Harvest-season field capture (make offline actually work in the field).**
The single highest-adoption-risk cluster; everything here is needed before the next harvest. Crew/foreman group entry (#1), reference-data offline cache — wire the already-declared `refCache` (#3), app-shell/`offline.html` cold-start fallback (#2), GPS geo-stamp on capture (#16), offline photo capture (#17). _Rationale: without #1–#3 the product cannot be used by a mandador on a zero-signal hillside, which is the core scenario._

**Run E.0 — Near-free wins (fold in as a fast warm-up or parallel small run).**
All days-scale, all already-built or trivially derivable: wire the dead cost-by-category/month reports (#20), surface cost centers in reports/exports (#21), add cost-per-quintal KPI (#34), PWA install prompt (#28), resolve/rewire the map cockpit (#23), scheduled export to contador (#36).

**Run F — Wage compliance & worker documents (kill the legal exposure).**
Minimum-wage top-up + statutory OT multiplier, writing back to profitability labor cost (#4 — the Labor+Money merge), statutory social-security deduction schema (#12), worker payslip/wage statement + e-ack, replacing the dead "Ver recibos" (#11), NPT/rain-day compensable category (#22), child-labor age gate (#29), payroll reopen/correction path (#35).

**Run G — Close the money loop (finished goods + receivables).**
Finished-goods inventory: implement `harvest_in` writers and yield reconciliation (#5), accounts-receivable / payment status on sales (#15), and the honest-sync reliability items that touch wage data: surface concurrent-edit conflicts (#27) and Background Sync (#26).

**Run H — Certification & audit readiness (the differentiator).**
Spray/application compliance log + re-entry-interval safety hold on labor assignment (#7), certification scorecard reporting for Fairtrade/RA/organic/C.A.F.E. (#6), certification-document attachments on farm/lot (#18), certifier chain-of-custody report + lot QR/traceability artifact built on the existing lineage schema (#10), PDF/printable professional report output (#19).

**Run I — Accounting bridge (make the contador's life easy).**
Scoped read-only accountant role (#13), QuickBooks/Xero/GL-mapped export/import (#14), worker contract/document-expiry tracking (#30), worker profile rolled-up history view (#31).

**Run J — Cooperative model (the strategic bet, months-scale).**
Producer/member entity distinct from worker, member-farm→coop→export-lot rollup, per-member settlement/advance tracking (#9). Large, but decisive for the coop go-to-market; pairs naturally with a member-lender composite report (#44).

**Run K — Payments & pricing reach.**
LATAM payment rail — Pagadito/dLocal/bank/QR fallback alongside Stripe (#8), PPP-adjusted base pricing (#24) shipped together with anti-arbitrage binding (#40), seasonal/harvest-elastic seats (#25), nonprofit/smallholder discount (#39). _Note: #8 is critical for revenue and could be pulled forward if collection is blocking paid conversions today; it's placed here only because it gates money, not field usefulness._

**Deferred / opportunistic (not recommended near-term):** public API + webhooks (#33, revisit with Run J coop scale), wet-mill/dry-mill staging depth (#32), VAT/IVA (#37), negative-stock guard (#38), provenance-tag consistency (#41), outbox backoff/UI (#42), mixed-currency-period fix (#43), NDVI/AI diagnosis (#45), livestock (#46 — out of scope for export coffee).

---

## 6. Completeness Critique (independent Opus critic)

## Completeness Critique — AgroPeq Gap Audit

The report is strong and mostly holds up. But six domain audits were run and **a whole seventh built subsystem (climate/weather) was never audited as a domain**, which distorts at least one gap's effort and severity. Plus two genuinely uncovered product categories. Details below.

### Missing categories (no domain covered these)

- **Notifications / SMS / WhatsApp — genuinely absent and the biggest hole the report doesn't name.** Zero hits for `sms|whatsapp|twilio|push|notification` in `src/`. The only outbound channel is the email digest — but field workers and many smallholders in NI/HN/GT don't run email; WhatsApp/SMS is *the* channel. **Ganaz, cited twice as a competitor, is fundamentally an SMS-to-worker product.** This under-cuts several findings the report treats separately: the worker payslip (#11), sync-failure surfacing (#42), and manager alerts would all naturally ride SMS/WhatsApp, not a route or email. Should be its own High-severity line.

- **Security/compliance posture (auth, worker PII, data protection) was never assessed.** Auth is delegated to `better-auth` (org plugin), so password reset/sessions exist library-side — but no one checked for MFA (none visible), account-recovery on shared coop phones, or **worker-PII handling under Guatemala/Honduras/Nicaragua data-protection law** (the DB stores worker `documentId`, rates, and — once #16 lands — geolocation). For a product whose own strength section brags about shared-device data-leak defenses, the absence of any privacy/PII/retention audit is a real gap.

- **Data migration from spreadsheets/competitors is shallow, not absent — and the report missed both facts.** `src/server/actions/importer.ts` exists but imports **only products and parcels**. A farm switching from Excel or a competitor needs to bulk-load *workers, historical harvests, and sales* — none of which the importer supports. The report never mentions the importer at all (Reporting even implies "no import path"), so it both over- and under-states the truth. Onboarding likewise has a route (`/[locale]/onboarding`) that no audit examined.

### Dropped / under-weighted

- **An entire climate/weather subsystem exists and was dropped.** `climateReadings` (schema with CHIRPS + Open-Meteo satellite ingest, per-farm daily rainfall/temp/humidity), `reports/climate.ts`, a `/climate` nav page, and `rain-activity-timeline.tsx` are all built. The report only references `climate-ingest` in passing (the map-cockpit note) and never audits it as a domain. This directly mis-scores **#22 (rain-day/NPT)**: the report calls it "weeks" and buries it at Medium, but per-farm daily rainfall *already exists* — an NPT compensable category is a join, not a from-scratch build, and belongs in the Run E.0 near-free-wins bucket. It also means the "map cockpit unwired" flag (#23) needs re-checking against the real cockpit/climate UI that does ship.

- **#12 omits Guatemala's IGSS.** The statutory social-security finding lists CCSS/IHSS/INSS but not **IGSS (Guatemala)** — and Guatemala is the report's own flagship coop market (FEDECOCAGUA is Guatemalan). Small, but it's the primary country in the target set.

### Disputed claims

- **US DOL Fact Sheet #26F is the wrong legal basis for a Central American product, and it leaks into two findings (#4, #11).** The report explicitly claims to have "dropped US-broadacre-only concerns," then justifies both the minimum-wage top-up and the payslip requirement with US H-2A/FLSA authority that does not apply to domestic NI/HN/GT operations. The findings are correct; the *justification smells wrong for the segment*. The real basis is national labor codes (Guatemala Código de Trabajo, Nicaragua/Honduras equivalents) mandating wage receipts (*constancia*) and minimum wage — plus Fairtrade's wage indicator. Swap the citation or the compliance framing loses credibility with the actual buyer.

- **The "cost/qq" and quintal framing is right, but verify the unit.** Central American coffee is benchmarked in quintal (46 kg oro / 100 lb), and #34 is well-placed — no dispute, just confirm the codebase's `outputUnit` uses the oro-equivalent quintal and not cherry weight, or the KPI misleads.

Net: the prioritization and the six audited domains are sound. Add **Notifications/SMS-WhatsApp** and a **security/PII posture** line as first-class gaps, fold **climate-aware NPT** into the near-free wins, deepen the **worker/historical import** story, and re-anchor the wage-compliance findings on local labor law rather than US DOL.

---

## 7. Reconciliation with the first-pass synthesis

The audit swarm ran twice end-to-end (independent syntheses over the same pipeline). The second pass (above) is canonical — it's what the critic reviewed — but the first pass surfaced findings the second dropped or under-weighted. They are retained here; several were spot-verified directly in the code by the supervising session:

| Finding (first pass) | Severity | Effort | Verified |
|---|---|---|---|
| No EUDR plot-geolocation due-diligence export — parcel PostGIS polygons are ready raw material, nothing packages them for EU importer due diligence (coffee in scope Dec 2025 / mid-2026) | High | weeks | schema grep: no eudr/deforestation surface |
| FX ingest + daily digest have **no scheduler wired** — `pnpm fx:ingest` / `digest:send` exist, but the repo has no vercel.json and no cron workflow (only ci.yml); org FX rates silently go stale, the digest never sends | High | days | verified in repo |
| Trial never expires — orgs without a subscription row get an indefinite top-tier `trialing` plan (`plan-limits.ts:84-110`); no countdown, no downgrade, no add-a-card moment | High | weeks | verified in code |
| No annual/seasonal billing option — monthly-only against once-a-year coffee income (Agworld is annual-only; Farmbrite discounts annual) | High | weeks | pricing model check |
| Legacy CSV exports (activities/products/parcels) **bypass role + plan gating** — documented as "permission-check-free" in `export/route.ts`; RLS still isolates tenants, but any org member can pull them | Medium | days | verified in code |
| Sale-to-cycle lineage has two unreconciled paths (manual pick vs. chain-derived) — an audit-integrity risk | Medium | days | flagged in both passes |

Severity deltas between passes: Background Sync was Critical in pass 1, Medium in pass 2 (pass 2 argues the cold-start/app-shell gap dominates it); statutory social-security deductions were the #1 Critical in pass 1, High in pass 2 — treat both as at least High. The critic additionally promotes **notifications via SMS/WhatsApp** (nothing in the codebase; the segment's actual channel — Ganaz is fundamentally an SMS product) and a **security/PII posture review** (worker `documentId` storage, no MFA, regional data-protection law) to first-class gaps, notes the **already-shipped climate subsystem** makes rain-day/NPT a near-free win rather than a weeks-scale build, flags the missing **IGSS (Guatemala)** in the statutory-deduction finding, and corrects the wage-compliance legal basis from US DOL/H-2A citations to national labor codes (Código de Trabajo) + Fairtrade wage indicators.
