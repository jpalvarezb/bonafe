I have a comprehensive evidence base. Here is the report.

---

# Competitive Landscape for AgroPeq
## Bilingual (Spanish-first) Farm-Management SaaS for Small/Mid Central American Farms

*Research synthesis from a deep-research workflow. Claims are tagged **[V]** (adversarially verified, survives=true), **[U]** (extracted but unverified — verification was cut short by rate limits; usable but treat with caution), or **[R]** (flagged/refuted-with-dissent — the underlying fact is noted where it survives cross-checking). Source URLs are cited inline.*

---

## Executive summary

No competitor today bundles AgroPeq's full stack — piecework payroll **plus** per-cycle harvest→processing→sales profitability **plus** multi-warehouse weighted-average inventory **plus** offline-first field capture — for the Spanish-first, small/mid, multi-crop Central American segment. The market splits into four clusters that each solve part of the problem:

- **Global FMS** (Granular, Agworld, Croptracker, AgriERP) — feature-rich but English-first, priced for larger commercial operations, and not localized for Central America.
- **LatAm agtech** (Auravant, Aegro, Instacrops, Kilimo, AGRI, Strider) — Spanish/Portuguese-capable and regionally credible, but concentrated in the Southern Cone/Mexico/Brazil, skewed toward precision-ag/satellite or Brazilian-tax ERP, and mostly **not** targeting Central America.
- **Farm-labor/ERP-packhouse tools** (FieldClock, PickTrace, Würk, Time Portal, Datamine CULTIVA Nómina, Hispatec ERPagro, FARMS Digital) — strong on piecework/destajo or export-ERP, but either US/H-2A-oriented or enterprise-exporter-scoped, and they don't own the full SMB farm-management suite.
- **Central America incumbents & status quo** (Aragro, Huella, COPERAWEB, ICAFE CR-CAFE, ANACAFE, IHCAFE, plus WhatsApp/Excel/paper) — real but fragmented, overwhelmingly **coffee-only or export-commodity-only**, and often government/donor tools rather than commercial multi-crop SaaS.

The Central America SMB niche specifically is **thinly served**: regional agtech is concentrated in South America and Mexico, most smallholder-facing tools have under 5,000 users, and Central American countries barely register in every regional census.

---

## 1. Competitor landscape by cluster

### 1a. Global farm-management software (FMS)

These are the incumbents by name recognition, but they consistently fail the Spanish-first / SMB-affordable / Central-America-present tests.

- **Granular (Corteva).** Listed as **English only, no Spanish support**, headquartered in San Francisco [V] (https://www.softwaresuggest.com/granular-agriculture). Its feature listing covers broad FMS categories (field mapping, crop planning, weather, inventory, labor) but shows **no explicit piecework/per-task payroll, no multi-warehouse weighted-average valuation, and no offline-first capture** — the exact axes AgroPeq differentiates on [U]. The commonly cited "$3–6/acre" Granular price could not be corroborated; the directory listing shows no pricing figures and zero reviews [V].

- **Agworld.** Transparent tiered pricing: **Basic $1,495/yr, Plus $2,495/yr, Pro $3,995/yr, Enterprise on request** [V] (https://www.getapp.com/industries-software/a/agworld/). Available on Web/Android/iOS, 4.5/5 across 44 reviews, independent/privately owned [V]. Feature-rich and offline-capable (its sync engine is analyzed as a "last-write" reconciliation model), but priced and positioned for larger commercial farms, English-first, no Central America localization.

- **Croptracker (Dragonfly IT).** Paid plans start at **$27.50 USD/user/month with a 10-user minimum (~$275/month floor)** [U], structurally aimed at larger operations (https://www.croptracker.com/pricing.html). Notably, its **Punch Clock: Piecerates** module does real piecework — custom piece rates per activity, auto-calculated pay with minimum-wage top-ups, blending hourly + piece rate, and links harvested inventory to the specific picker/crew [U] (https://www.croptracker.com/product/farm-management-software/farm-labor-tracking/punch-clock-piecerates.html). Its time-tracking works offline [U]. But it is fruit/veg-and-food-safety scoped, sold via 20+ à-la-carte add-on modules (sales-led, not Stripe self-serve), and its customer base/testimonials are **concentrated in Canada with no Spanish-language or Central American presence** [U].

- **AgriERP.** A full farm ERP **built on Microsoft Dynamics 365 / Business Central** [U] — heavier than a standalone SaaS. It has genuine piece-rate management tied to plots/crops [U], but its offices are US/Canada/Saudi/Australia/UK (no LatAm) and its named customers are large US commodity growers (Weaver Popcorn, Western Growers) [U] (https://agrierp.com/piece-rate-management-to-track-labor-productivity/). No published pricing, no offline claim [U].

- **Climate FieldView (Bayer), Trimble Ag, AgriWebb (livestock)** appear in the offline-sync research. AgriWebb documents a mobile sync "best practice" (queue-and-sync) model (https://help.agriwebb.com/en/articles/6828757-syncing-the-mobile-app-best-practice); FieldView documents offline data collection. None surface as Spanish-first Central America players.

### 1b. LatAm-wide agtech (Spanish/Portuguese, regionally credible)

These are the most credible near-competitors by language and region — but almost none actually target Central America.

- **Auravant (Argentina).** A SaaS precision-ag "Big Data" platform for agronomists and farmers, with satellite/UAV crop monitoring, field zoning, variable-rate prescriptions, and a developer SDK/API ("Innovation Framework") [V] (https://theyieldlablatam.com/companies/auravant/). Its own site claims **123,000+ users, 20M+ hectares monitored, activity in 156+ countries, localization in EN/ES/PT/FR, and ISO 27001:2022** [U], with offices in Buenos Aires, São Paulo, and Madrid [U] (https://www.auravant.com/en/home-en/). This is the strongest Spanish-first regional brand — but its wedge is **satellite precision-ag, not payroll/piecework, inventory costing, or per-cycle profitability**, and Central America presence is unconfirmed.

- **Aegro (Brazil).** Reports **4M hectares managed and R$50B in sales processed** [V], with free unlimited electronic invoicing (NF-e/MDF-e) [V] — but it is **Brazil-only, Portuguese, and wired to Brazilian tax infrastructure (SEFAZ)** [V] (https://aegro.com.br/). Its marketing claim of being "100% offline" is **overstated [R]** — the reality is an offline-first *mobile* app (Aegro Campo) that records field activity and syncs on reconnect, not a fully offline platform. (A separate "R$10B in NF-e" claim could not be independently verified [R]; the R$50B sales figure survives [V].)

- **Instacrops (Chile, YC S21).** IoT sensors + satellite/drone data feeding an ML "virtual advisor" dashboard [V], operating across **300–350+ farms in LatAm** with **$200K+ monthly revenue and 2× YoY growth** [V], founded 2014 (https://www.ycombinator.com/companies/instacrops). A hardware-inclusive precision-ag platform, not a lightweight SMB records SaaS. (Its self-reported "34 employees" is flagged as possibly stale — PitchBook/Tracxn show 15–19 [R].)

- **Kilimo (Argentina).** Irrigation/water-efficiency advisory using satellite + soil-moisture data; raised a **$7.5M Series A** (Emerald Technology Ventures, The Yield Lab Latam et al.) [U] (https://impactalpha.com/argentine-agtech-startup-kilimo-raises-expansion-capital/). Monetizes partly by selling verified water savings to corporates (Microsoft, Intel, Coca-Cola) [U]. Expansion roadmap targets **Mexico, Chile, Argentina, US — explicitly not Central America** [U]. Narrow water wedge, not a farm-management suite.

- **AGRI (agri.mx).** A multi-country Spanish farm-management SaaS with published pricing: **Semilla $320/mo (3 users), Campo $480/mo (4 users), Agrícola $715/mo (6 users)** [U], month-to-month, with customizable cost centers (budget-vs-actuals-adjacent) but a **6–8 week implementation** [U]. Operates across Chile, Colombia, Ecuador, Peru, Argentina, Mexico, Uruguay, and the US — **no Central American country listed** [U] (https://www.agri.mx/en/precios/). Pricing is well above SMB Central American sensitivity.

- **Strider (Syngenta, Brazil).** Explicitly targets **medium/large farms >5,000 hectares** — six of Brazil's ten largest ag operations plus ~700 others [V]; acquired by Syngenta in 2018 [V] (https://agfundernews.com/syngenta-acquire-brazilian-strider). Enterprise, not SMB.

- **SpaceAG (Colombia)** appears as a "Software de Nómina Agrícola" with a workers module (https://www.spaceag.co/trabajadores) — a Spanish-language agricultural payroll play, though details weren't verified in depth.

### 1c. Farm-labor / piecework payroll & ERP-packhouse tools

This is where AgroPeq's payroll+piecework ambition meets specialized competition — but these tools are point solutions, not full farm-management suites, and are mostly US/H-2A or Mexico-tax-bound.

- **FieldClock (US, Washington).** Piece tracking via **QR-code scanning per bin/unit** [R — holds up on cross-check], Bluetooth-scale pay-by-weight [V], offline capture with sync-on-reconnect [V] — but **payroll is outsourced to a third-party ADP partnership** [V], it exposes only an API (no built-in per-cycle profitability/inventory/costing) [V], and it is US-market/English-first, marketed as a Farm Bureau member benefit [V] (https://www.fieldclock.com/features/piece-tracking).

- **PickTrace (US, YC S15).** Serves large berry/citrus/apple growers in **US, Mexico, Peru, Chile, Australia** [U]. Its proprietary **"Wage Engine"** automates piece-rate payroll (rest-break pay, NPT, overtime, minimum-wage top-ups, 7th-day rules) and offers a **PayCard** (reloadable Mastercard usable in US + Mexico) [U] (https://picktrace.com/). But it integrates with external payroll (Famous, Datatech) rather than running disbursement, publishes no pricing, and is US-specialty-crop-focused [U].

- **Würk (US).** Piecework + variable pay, multilingual worker access, offline time-tracking with location, H-2A tooling [U] — but its named clients are **predominantly cannabis brands**, suggesting cannabis-HR repositioned as "agriculture" [U] (https://enjoywurk.com/industries/agriculture/).

- **Time Portal (US, Orlando).** H-2A-compliance timekeeping, offline mobile clock, **piece-work/destajo tracking with minimum-wage calculators** [U] (https://www.timeportal.io/). US labor-contractor focus.

- **Datamine CULTIVA Nómina (Mexico).** The closest destajo-native competitor: worker payment **"por Cuadrilla y Destajo"** (by crew and piece-rate) with immediate calculation [U], GPS-geofenced mobile attendance validated against the ranch perimeter [U], barcode-scanned harvest bins for point-of-harvest piece pay [U], and **payroll costs auto-allocated to specific lots/plots** (overlapping AgroPeq's per-parcel costing) [U]. But it is hard-wired to **Mexican CFDI 4.0 / SAT tax law** and marketed for Mexico, not Central America [U] (https://www.datamine.com.mx/landings/landingnominacultiva.html).

- **RawData (Spain).** "360º" ag + personnel software with destajo kg-per-worker productivity tracking [U], but EU-subsidized and built around **Spanish labor law** (libro de control de jornal) [U] (https://agrawdata.com/).

- **Hispatec ERPagro (Spain, with Central America unit).** A **heavy enterprise agri-ERP** — full financial/analytical accounting, treasury, tax/customs, EDI, plus a built-in HR/payroll ("Field Payroll") module [V][U]. Customers are **large exporters/cooperatives**: Camposol, and Trops (3,000+ farming partners) [V] (https://www.hispatec.com/en/productos/erpagro-software-agriculture/). Crucially, **Hispatec Centroamérica has a Costa Rica office serving all 7 Central American countries** [U], claims 700+ companies across 30 countries [U], targets GlobalGAP/ISO-certified export crops (fruit, veg, coffee, cacao) [U], and its Farm Management modules (Campogest, Agrotareo) can be sold standalone [U] (https://centroamerica.hispatec.com/). This is AgroPeq's most direct **enterprise-tier** competitor in-region — but priced/scoped for certified exporters, not SMB, and no pricing/offline transparency [R].

- **FARMS Digital (Compagnie Fruitière, France).** A **banana-sector-specific** platform spun out of a major banana exporter, commercialized externally only since 2024 [U]. Already live in **Brazil, Guatemala, Dominican Republic, Ecuador, Honduras**, with Costa Rica/Mexico/Colombia expansion planned [U], 14,000+ ha installed base in Africa [U], and a **dedicated HIRIS labor-management module** plus RFID traceability on the roadmap [U] (https://www.freshplaza.com/north-america/article/9829662/). Targets **large commercial banana producers**, not smallholders [U].

- **Other agri-ERP/packhouse** in the frame: FarmERP (ProcessPack packhouse module), Produce Pro (Aptean), Silo, Cropwise Operations (formerly Cropio), AFS, Odoo Agriculture, plus regional resellers **Agrobit via GYSSA (Guatemala), Agrosoft LATAM/XASS, Softland ERP Honduras, Aritmos, ALFASA (Costa Rica coffee beneficios), and Banano Manager**. These are largely enterprise/implementation-led.

### 1d. Central America incumbents (coffee-first, fragmented)

Central America already has a real but **narrow** software layer — almost entirely coffee, and heavily government/donor/cooperative rather than commercial multi-crop SaaS.

- **Aragro (Guatemala).** The single closest head-to-head competitor. A Guatemala-specific farm-management app with **freemium (20 free activities), then Seed $100/mo (1 farm, 2 users) up to Harvest $350/mo** [U]. Its Harvest tier **already bundles piecework wages, multi-warehouse inventory, harvest processing & sales, and agricultural budgeting** — directly overlapping four of AgroPeq's headline differentiators [U]. It offers **full Spanish support built around Guatemalan agricultural reality** and export-certification compliance (Rainforest Alliance, UTZ, Organic) [U]. **The key gap: Aragro is explicitly cloud-only and requires an internet connection — no offline mode** [U], and its crop/geo focus is narrow (coffee, cardamom, corn, beans, cane, banana, palm; Guatemala only) (https://aragro.com/en/guatemala).

- **Huella (Guatemala).** An "operating system for coffee cooperatives and beneficios" [V] with **offline field capture** (log harvests, move inventory, record quality without WiFi/data) [V], a **6-level warehouse hierarchy** (Bodega→Zona→Pasillo→Estante→Contenedor→Ubicación) [V], built-in fermentation/drying/cupping quality modules [V], and per-batch QR traceability [V] (https://www.huella.gt/). It markets "50h less manual work / +15% better price" but with **no pricing, client count, or founding date disclosed** [V]. Coffee-only, processor-scoped — not general multi-crop farm management.

- **COPERAWEB.** An intelligent ERP/traceability system for **coffee/cocoa/fruit collection and export companies**, trusted by **80+ agro-exporters** [V], with offline field-capture apps [V], scale/roaster hardware integration [V], and group-certification management [V] (https://coperaweb.com/). Aggregator/exporter-scoped, not per-farm SMB.

- **ICAFE CR-CAFE (Costa Rica).** **100% free**, iOS/Android, offline-capable with a companion web portal — but **gated to registered Costa Rican coffee producers**, coffee-only, and **donor/government-funded (CABEI + USAID)** [U]. It has **no cost-tracking, payroll, inventory, budgets, or billing** [U] (https://www.icafe.cr/actualizacion-crcafe/).

- **ANACAFE (Guatemala).** Runs "Coffee Cloud" (an early-warning/alerts app) and "Coffee Search System" (producer-buyer traceability/matchmaking), both **member-gated, coffee-only** [U] (https://www.anacafe.org/area-de-produccion-de-cafe/).

- **IHCAFE (Honduras).** "MiIHCAFE" (launched Sept 2024) is a **single-purpose EUDR georeferencing tool** — GPS plot registration only, Android-only, no crop/cost/labor/inventory features [U] (https://ihcafe.hn/). A separate IHCAFE app is a government subsidy-lookup tool [U]. Traceability tooling in Honduras is fragmented across multiple parallel efforts (MiIHCAFE, Trazar-Agro, GrainChain, TraceFoodChain/AgStack open-source) [U].

- **Fedecocagua** (148 coops, ~20,000 small coffee producers) offers technical/finance/export services but **no software/farm-management platform** on its site [U].

- **Pantaleón (Guatemala sugar).** Uses **in-house AI/BI models** (no purchased SaaS) for input prescription and irrigation across cultivation/milling [U] (https://tecnicana.org/) — an internal-build, not a competitor product.

- **WSeeds (Colombia-origin, VerdeXcelerate-backed).** AI + blockchain + **WhatsApp-based chatbot** for recording production data and generating certification docs [V], IoT sensors [V], targeting BPA/GlobalGAP/organic certification [V]. Grew from **~$6K (2023) to a projected $240K (2025), reaching 1,718 farmers** [V] — still very early-stage. Its site is **Colombia-centric, not Guatemala/Central-America** as sometimes assumed [V] (https://wseeds.co/es/).

### 1e. Open-source & spreadsheet/WhatsApp status quo

The real incumbent for most small Central American farms is **no software at all**.

- **farmOS** (Drupal-based, self-hosted or hosted via Farmier) and **LiteFarm** (UBC, free, and it explicitly ships offline capability — "No Signal? No Problem," https://www.litefarm.org/post/no-signal-no-problem-litefarm-goes-offline) are the two active open-source options. **Tania** appears stalled/unmaintained; **Ekylibre** is a French open-source ag-ERP with limited Spanish/LatAm relevance. Self-hosting farmOS realistically requires technical capacity most smallholders lack.
- **WhatsApp** is documented as a vital field-coordination and record-keeping channel in global agriculture (e.g. "FarmLog," a WhatsApp field notebook, https://brioagro.com/farmlog-the-first-whatsapp-field-notebook-that-makes-life-easier-for-farmers/), alongside **Excel/Google Sheets and paper ledgers**. WSeeds' WhatsApp-chatbot design [V] is itself a tacit acknowledgment that WhatsApp is where these farmers already are.
- Adoption baseline: the **GSMA/IDB Lab landscape (Nov 2020)** found only ~131 digital agriculture tools across all of LatAm/Caribbean, most with **1,000–5,000 users** (Farmforce ~1,500) and very few exceeding 25,000 [U] — evidence the paid-SaaS category is thin and the "do-nothing" baseline dominates.

---

## 2. Comparison table — most relevant competitors

*Pricing in USD unless noted. "?" = not publicly disclosed. Verification tags apply to the key facts, not every cell.*

| Competitor | Cluster | Target market | Offline field capture | Payroll / piecework | Spanish-first | Per-cycle / profitability accounting | Pricing |
|---|---|---|---|---|---|---|---|
| **Aragro** (GT) | CentAm SMB | Small/mid GT farms, export-cert coffee/cardamom | **No** — cloud-only, needs internet [U] | **Yes** — piecework in Harvest tier [U] | **Yes** — full ES, GT-built [U] | Harvest tier: processing + sales + budgeting [U] | Free (20 activities) → $100/mo → **$350/mo** [U] |
| **Hispatec ERPagro / Centroamérica** (ES/CR) | ERP / export | Large exporters, coops (all 7 CA countries) [U] | Not disclosed [R] | **Yes** — HR + Field Payroll module [V][U] | Yes (ES ops, CR office) [U] | Yes — full analytical accounting, cost control [V] | Not disclosed (enterprise) [R] |
| **Huella** (GT) | CentAm coffee | Coffee coops / beneficios [V] | **Yes** — harvest/inventory/quality offline [V] | Not featured | **Yes** — ES [V] | Batch/lot quality + 6-level warehouse; valuation method unstated [V] | Not disclosed [V] |
| **COPERAWEB** | CentAm coffee/cocoa | 80+ agro-exporters/collectors [V] | **Yes** — offline field apps [V] | Not featured | Yes (ES) | Traceability/internal-control ERP; scale integration [V] | Not disclosed [V] |
| **Aegro** (BR) | LatAm agtech | Brazilian farms | Mobile offline sync only ("100% offline" is overstated) [R] | Limited | **No** — Portuguese only [V] | Financial + NF-e; Brazil-tax-bound [V] | Not itemized (managed 4M ha) [V] |
| **Auravant** (AR) | LatAm agtech | Agronomists/farmers, global | Not the core wedge | No | **Yes** — EN/ES/PT/FR [U] | No — precision-ag/satellite focus | Freemium + paid (not itemized here) |
| **AGRI** (agri.mx) | LatAm agtech | Mid farms, 8 countries (**no CA**) [U] | Not emphasized | Limited | **Yes** — ES [U] | Customizable cost centers (budget-vs-actuals-adjacent) [U] | **$320 / $480 / $715 /mo** [U] |
| **Croptracker** (CA) | Global FMS | Fruit/veg growers (Canada/US) [U] | **Yes** — time tracking offline [U] | **Yes** — Piecerates module, links picker→inventory [U] | **No** — English, no CA presence [U] | Labor↔Harvest link (not full per-cycle P&L) [U] | **$27.50/user/mo, 10-user min (~$275/mo floor)** [U] |
| **Agworld** (global) | Global FMS | Larger commercial farms | Yes — queue/sync engine | Limited | No | Financial insights (Plus tier+) | **$1,495 / $2,495 / $3,995 /yr** [V] |
| **Granular** (Corteva) | Global FMS | US commercial farms | Not in listing [U] | Not in listing [U] | **No — English only** [V] | Financial reporting; no weighted-avg noted [U] | Not disclosed on directory [V] |
| **FieldClock** (US) | Labor/piecework | US specialty-crop growers | **Yes** — offline sync [V] | **Yes** — QR piece + Bluetooth scale; **payroll via ADP** [V] | No — English-first [V] | **No** — API only, no costing [V] | Not disclosed [U] |
| **PickTrace** (US) | Labor/piecework | Large growers US/MX/PE/CL/AU [U] | Not emphasized | **Yes** — "Wage Engine," PayCard (US+MX) [U] | Partial (MX ops) | No — integrates external payroll/ERP [U] | Not disclosed [U] |
| **Datamine CULTIVA Nómina** (MX) | Labor/piecework | Mexican farms | Yes — GPS geofence attendance [U] | **Yes** — destajo by crew, barcode bins, per-lot cost allocation [U] | **Yes** — ES, but MX-tax-bound (CFDI/SAT) [U] | Per-lot labor cost only [U] | Not disclosed [U] |
| **FARMS Digital** (FR) | ERP / banana | Large banana exporters; live in GT/HN [U] | Mobile weighing on roadmap | HIRIS labor module (roadmap) [U] | Partial | Bunch/plot-level yield tracking [U] | Not disclosed [U] |
| **farmOS / LiteFarm** | Open-source | DIY / NGO-supported | LiteFarm: **Yes** [angle src] | No | Partial (community translations) | Limited | **Free** (self-host / hosted add-on) |

---

## 3. How crowded is the Central America SMB niche?

**Not crowded — thin, fragmented, and coffee-skewed.** Multiple independent regional censuses put Central America at the far tail:

- The **Brixton Venture Lab map (2023)** identified **409 LatAm agtech companies** (updated to 600+ in 2024), but **Argentina 31%, Mexico 26%, Chile 14%, Colombia 9% = 80% of the total** [V]. Central American countries are in the 20-country dataset but **not called out as hubs** [V] (https://www.brixtonventurelab.com/post/ecosistema-agtech-latam-2023). Only ~28% of mapped companies had received private capital [V].
- The **Radar AgTech LAC 2026 census (Embrapa/IICA)** mapped **2,656 startups across 23 countries**, of which **Brazil alone is 78% (2,075)**; the next tier is Argentina (158), Mexico (110), Chile (91), Colombia (79), Uruguay (74) — **no Central American country appears among the top counts, and 10 of 33 countries had zero identified startups** [U] (https://3tres3.com / https://radaragtech.com.br).
- The **GSMA/IDB Lab landscape (2020)** found only **~131 smallholder-facing digital ag tools in all of LatAm/Caribbean**, most with **1,000–5,000 users**; Colombia alone accounts for ~a third of them, implying Central America holds a comparatively smaller share [U]. Agritech is described as one of the most **undercapitalized** LatAm VC sectors (~1% of volume) [U].
- **AgFunder 2024**: LatAm/Caribbean agrifoodtech closed **$421M across 89 deals** (Brazil $224M, Mexico $97M, Chile $58M) — and **more than half went to upstream/marketplace categories, not farm-management SaaS** [U]. LatAm captured **<0.5% of global ag investment capital** in 2021–22 [U].

Within Central America proper, the "competition" is largely **accelerators and single-crop institutional tools**, not scaled commercial SMB SaaS: **VerdeXcelerate** (TechnoServe/BID Lab/Argidius, 6 countries, targeting 100 startups / 3,000 farmers) [V]; **Zamorano AgroHub** (92 startups from SV/GT/HN, but **no farm-management product named among them**) [V]; and coffee institutions (ICAFE, ANACAFE, IHCAFE) shipping free single-purpose apps.

**Implication:** The niche is open. The barrier is not incumbent density — it is **adoption economics** (rural internet gaps, low willingness-to-pay, and credit-card/Stripe penetration limits vs. cash/Tigo Money mobile money, flagged in the market-barriers angle). The competitors that exist are either the wrong tier (enterprise/exporter), the wrong crop (coffee/banana-only), the wrong geography (South America/Mexico), or the wrong stack (labor-only, precision-ag-only).

---

## 4. Open gaps no competitor fills well

1. **The full integrated SMB bundle, offline, in Central America.** No competitor combines **piecework payroll + harvest→processing→sales per-cycle profitability + multi-warehouse weighted-average inventory + offline-first capture** in one Spanish-first SMB product for the region. Aragro comes closest on the bundle **but has no offline mode** [U]; Huella/COPERAWEB have offline but are **coffee/aggregator-scoped** [V]; Datamine/FieldClock/PickTrace do piecework **but no farm-management suite or profitability** [U][V]; Hispatec does profitability **but is enterprise-priced for exporters** [V].

2. **Piecework payroll wired to per-cycle profitability.** Labor tools stop at wage calculation (FieldClock outsources payroll to ADP [V]; PickTrace integrates external payroll [U]; Datamine allocates labor cost to lots but is Mexico-tax-bound [U]). None connect destajo labor cost through to a **harvest→processing→sales margin per cycle**. This integration is a genuine white space.

3. **Multi-warehouse weighted-average valuation explicitly.** Almost no competitor advertises the **valuation method**. Huella has a rich 6-level warehouse hierarchy but doesn't state weighted-average [V]. This is under-served and defensible.

4. **Robust offline-first sync (exactly-once/idempotent).** Offline capture is now a **checkbox** many claim — Aegro, Croptracker, FieldClock, LiteFarm, Huella, COPERAWEB, CR-CAFE all claim some offline mode. But the evidence shows the field is dominated by **naive sync**: Aegro's "100% offline" is overstated [R]; KoboToolbox has documented **duplicate-submission** problems; ArcGIS Field Maps has documented **offline-edit sync failures**. Genuinely **exactly-once/idempotent sync** is rare and remains a real technical differentiator — though it must be marketed as reliability, not just "works offline," which competitors already claim.

5. **Multi-crop, general-purpose SMB (not coffee/banana silos).** The Central America incumbent layer is overwhelmingly **single-crop** — coffee (Huella, COPERAWEB, CR-CAFE, ANACAFE, IHCAFE) or banana (FARMS Digital). A **general multi-crop** SMB tool (corn, beans, vegetables, horticulture alongside coffee) is largely unaddressed by a commercial product.

6. **Self-serve, transparent, low-price SaaS billing.** Most competitors are **sales-led with hidden pricing** (Hispatec, FieldClock, PickTrace, Datamine, FARMS Digital, AgriERP all undisclosed). Transparent, self-serve, **Stripe-style billing at SMB price points** is uncommon — though note the countervailing risk: **credit-card/Stripe penetration is limited in rural Central America** (the market-barriers angle flags cash and Tigo Money mobile money as dominant), so Stripe-only billing is simultaneously a differentiator *and* a potential adoption barrier to hedge with alternative payment rails.

7. **Localized labor-law/tax compliance.** Datamine (CFDI/SAT) is Mexico-bound, RawData (libro de jornal) is Spain-bound, Hispatec skews to formal Spain/Peru regimes. **Central-America-specific** piecework/destajo compliance is not owned by any tool — an opening for AgroPeq to be the region-native option.

---

### Verification caveats

- Roughly **75 claims are adversarially verified [V]**; ~**205 are unverified [U]** (verification was cut short by rate limits — usable but not independently confirmed); **6 are flagged [R]** (mostly nuance/staleness flags where the core fact still tends to survive cross-checking — e.g. Aegro's overstated "100% offline," Instacrops' possibly-stale headcount).
- **Pricing to treat as firmest:** Agworld ($1,495/$2,495/$3,995/yr) is **[V]**. Aragro ($100–$350/mo), AGRI ($320/$480/$715/mo), and Croptracker ($27.50/user/mo, 10-user min) are **[U]** — directionally reliable but pulled from single sources and unverified.
- The **MazaoHub "10 Global Farm Management Software" listicle** (a frequently-cited secondary source) **could not be retrieved** [U] — any Hispatec/FARMS/Aragro facts attributed to it should be sourced from the primary vendor pages cited above instead.
