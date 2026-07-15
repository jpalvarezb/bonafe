# AgroPeq — Competitive Positioning

*Synthesis of [codebase-dossier.md](codebase-dossier.md) (multi-agent code analysis, 84 adversarially verified claims) and [market-landscape.md](market-landscape.md) (deep web research, 75 verified claims). July 2026.*

## 1. The niche

AgroPeq is a **Spanish-first whole-farm ERP for smallholder-to-mid-size Central American farms and cooperatives with day-labor/piecework crews and unreliable rural connectivity**. The 10–50 ha profile is the *encoded demo customer*, not a product limit — nothing in the code caps farm size (plan tiers gate farm count and users, not hectares), but every seeded demo farm is under 50 ha, which is who the fixtures and marketing artifacts are aimed at. This is not an aspiration — it is encoded in the product: seed data models a Matagalpa (Nicaragua) coffee operation with lata harvest units, Broca/Roya pest tracking, $8–12/day jornaleros and NIO/USD dual currency; regional labor vocabulary (planilla, destajo, jornal, cortero) exists as TypeScript enums, not translated copy; pricing is three flat self-serve tiers (Semilla $100 / Cultivo $200 / Cosecha $350 per month) far below enterprise agri-ERP.

The market research confirms this niche is **open**: Central America barely registers in every regional agtech census (Radar AgTech LAC 2026: Brazil 78% of 2,656 startups, no CA country in the top tier; Brixton 2023: AR+MX+CL+CO = 80% of LatAm agtech). The incumbent layer in-region is coffee-only institutional apps (ICAFE, ANACAFE, IHCAFE), exporter-scoped ERPs (Hispatec, COPERAWEB), and — for most farms — WhatsApp, Excel, and paper.

## 2. The one-line competitive claim

**No competitor bundles piecework payroll + per-cycle harvest→processing→sales profitability + multi-warehouse weighted-average inventory + offline-first field capture in one Spanish-first SMB product.** Every rival fails at least one axis:

| Closest competitor | Has | Missing vs AgroPeq |
|---|---|---|
| **Aragro** (Guatemala) — the direct head-to-head | Piecework, multi-warehouse, processing+sales, budgets; free→$100→$350/mo (same price points) | **No offline mode at all** (cloud-only); Guatemala-only |
| **Huella / COPERAWEB** (GT/CA) | Offline capture, warehouse depth, traceability | Coffee/exporter-scoped; no payroll, no multi-crop farm management |
| **Hispatec ERPagro** (CR office, all 7 CA countries) | Full accounting + field payroll | Enterprise-priced, sales-led, exporter tier — not SMB |
| **FieldClock / PickTrace / Datamine CULTIVA** | Best-in-class piecework capture | Point solutions; payroll outsourced or MX-tax-bound; no farm suite or profitability |
| **Auravant / Instacrops / Kilimo** (LatAm) | Spanish, regional brand, precision-ag | No payroll/inventory/profitability; no CA presence |
| **Agworld / Granular / Croptracker** (global) | Feature breadth | English-first, priced for large commercial farms, no CA localization |
| **farmOS / LiteFarm / WhatsApp+Excel** | Free | No payroll, no costing; self-hosting beyond most smallholders |

## 3. Differentiation that survived adversarial verification

- **Offline exactly-once sync is real and rare.** The code has an idempotent outbox (UUIDv7 keys, single-flight flush, crash recovery) with per-mutation-kind conflict handling and a row-locked, monotone work-order merge — while the market is full of *claimed* offline that is naive sync (Aegro's "100% offline" refuted; documented duplicate-submission and sync-failure problems in KoboToolbox/ArcGIS Field Maps). Caveat: "works offline" is a checkbox everyone claims — the marketable claim is **reliability** (never lose or duplicate a field record).
- **DB-enforced multi-tenancy** (fail-closed Postgres RLS on ~40 tables + NOBYPASSRLS role + CI coverage guard) — strongest engineering moat, hard to retrofit.
- **Purpose-built day-laborer payroll** (attendance fractions, piece rates, frozen rate snapshots, period locks) vs US/EU salaried assumptions.
- **Domain-native localization** — regional units and labor concepts as enum values, not JSON copy; an English-first competitor cannot cheaply bolt this on.
- **Decimal-precise money math** unit-tested across payroll/inventory/profitability/variance.
- **DB-level crop-cycle overlap guard** permitting intercropping (btree_gist EXCLUDE) — generic tools have nothing comparable.

## 4. Gaps and risks (code-verified)

The two biggest market white spaces are **exactly the half-wired parts of the codebase**:

1. **Piecework is not attributed to crop cycles** (`pieceworkEntries` has no `crop_cycle_id`; activity labor cost path is an admitted stub). The market's #1 gap — destajo labor wired through to per-cycle margin — is currently a claim, not a fact. Same for **WAC inventory**: real weighted-average valuation exists but activity input costs are manually re-typed, so P&L can silently diverge from inventory value.
2. **Profitability is cycle-average, not lot-level COGS**; sales-to-cycle is an unvalidated manual tag.

Other verified risks:
- **Zero e2e/integration tests** — nothing exercises RLS boundaries, sync, or Stripe webhooks at runtime; sales/purchases/transfers have no tests at all. Material diligence risk.
- **No notifications of any kind** (invite email is a `console.log` stub) and **no API/webhook surface** — no path to accountants, banks, or certification systems.
- **Export lock-in**: no export of harvests, sales, payroll, or inventory. For a trust-sensitive SMB market, data-out is table stakes.
- **Billing denomination/presentation gap** — Stripe accepts any credit card, so payment *acceptance* is not the issue; the gap is narrower: checkout is denominated USD-only (`stripe.ts`) despite the app modeling NIO/GTQ/HNL/CRC natively, and FX is manual entry with no rate feed. Self-serve transparent billing remains a differentiator (most rivals hide pricing); the residual adoption risk is customers without cards at all, worth hedging with manual invoicing.
- **Offline covers only 5 of ~24 modules**, conflict resolution is discard-only.
- **No agronomic intelligence** (no GDD, pest-trend, spray advisories) — fine, but don't market decision support.

## 5. Strategic moves

1. **Close the money loop first.** Add `crop_cycle_id` to piecework, wire WAC costs into activity costing, and link harvest lot → processing → sale. This converts the market's biggest unfilled gap from marketing claim to verified fact — nobody else has it.
2. **Attack Aragro head-on with offline reliability.** Identical price points, near-identical bundle, but Aragro is cloud-only. "Your planilla and harvest weights survive a dead signal — exactly once" is the wedge in Guatemala/Nicaragua/Honduras.
3. **Ship accountant-grade CSV export (payroll, sales, harvests, inventory) before any API.** Cheap, kills the lock-in objection, and matches how CA accountants actually work.
4. **Hedge payment rails**: keep Stripe self-serve (transparency is rare in this market) but add manual invoicing/mobile-money paths for orgs without cards.
5. **Do not chase** precision-ag/satellite intelligence (Auravant/Instacrops own it), enterprise exporter ERP (Hispatec), or single-crop traceability (Huella/COPERAWEB/FARMS Digital). Stay the **multi-crop SMB operating system**; a lightweight WhatsApp/email digest is a better notification investment than a native alerting engine.
6. **Before selling up-market or raising**: add an e2e test suite over RLS isolation, offline sync, and the Stripe state machine — the engineering is strong but currently unproven at the integration level.
