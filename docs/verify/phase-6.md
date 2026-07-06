# Phase 6 verification — Tier 3b (processing, sales, piecework, stages, WO config)

Setup as in phase-1.md. Login: owner@demo.agropeq.io / demo1234, org **finca-demo**.

## Processing (678 lata → 1560 kg fixture)

1. **Procesamiento**: seeded run on Café 2026-A — 678 lata → 1,560 kg
   pergamino, yield shown, cost 250.00. Lots subpage: "Lote Café Junio 2026"
   (closed) holds the 12 seeded harvests; per-unit total 678 lata.
2. Create a new open lot on the same cycle → only unattached harvests are
   offered; attach/remove works; closing freezes it. A harvest can never be
   in two lots.

## Sales & profitability (the reconciliation fixture)

3. **Ventas**: seeded sale V-00051, Exportadora Atlantic, 1,560 kg × 3.20 =
   4,992.00 USD on Café 2026-A. Create + delete a small test sale.
4. **Rentabilidad** (sidebar): Café 2026-A row shows income 4,992.00,
   processing cost 250.00, activity cost = the cycle's dashboard total, and
   profit = income − (activity + processing); margin %, profit/ha and cost
   per kg (output 1,560 kg) populated. Piecework appears as an org-level
   footnote (not attributed to cycles).

## Piecework → payroll

5. **Destajo**: 2 seeded rates; 3 seeded June entries (José 40 lata = 44.00,
   Rosa 35 lata = 38.50, Ana 50 surcos = 40.00). Capture a new entry → amount
   = qty × rate snapshot (edit the rate afterwards; old entries keep the old
   amount).
6. **Planilla**: generate a fresh period for 2026-06-16 → 2026-06-29 → José/
   Rosa/Ana nets now include their destajo (e.g. José 119.00 + 44.00 =
   163.00); Pedro's fixture (112.50) is unchanged. Note: this supersedes the
   phase-4 doc's "everyone else = 14 × rate" for workers with piecework.
7. A worker with piecework but zero attendance in range still gets a payroll
   entry (piecework only).

## Stages, WO checklist, parcel attributes

8. **Catálogo → Etapas**: 8 global stages grouped by crop; org stages can be
   created/deleted; global ones can't be deleted.
9. **Ciclos**: set Café 2026-A to "Maduración" (only coffee stages offered —
   maize stages rejected server-side); stage shows in the list.
10. **Órdenes de trabajo**: create one with 3 checklist lines → items render
    with toggles; completing with unchecked items is blocked with a banner;
    check all → complete succeeds.
11. **Parcela** (edit): add attributes (e.g. altitud=1350 msnm, sombra=40%)
    → chips render on the farm's parcel list; limits enforced (max 20 pairs).

## Gating & isolation

12. vecino-sa (Semilla): Procesamiento, Ventas, Rentabilidad, Destajo all
    redirect to the plan page; direct POSTs rejected server-side.
13. finca-demo ids in vecino URLs/forms → not found.

## Automated

`pnpm test` (31 tests incl. the 1000kg→200kg profitability fixture and
processing yield) · `pnpm typecheck` · `pnpm build` — green at Phase 6 close.
