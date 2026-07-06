# Phase 5 verification — Tier 3a (warehouses, machinery, planning, budgets)

Setup as in phase-1.md. Login: owner@demo.agropeq.io / demo1234, org **finca-demo**.

## Warehouses & transfers (weighted-average moves)

1. **Bodegas**: 2 seeded — Bodega Central (default) + Bodega Norte (Vista
   Hermosa). Transfer history shows the seeded 2026-06-25 transfer.
2. **Inventario**: Urea appears split — Central 26.0000 qq @ 33.00 (857.00…
   858.00) and Norte 4.0000 qq @ 33.00 = 132.00; total value unchanged by the
   transfer (transfers move value, never create it).
3. New transfer: 2 qq Urea Central → Norte → Central 24 / Norte 6, both still
   avg 33.00. Attempt to transfer 999 qq → form shows "existencias
   insuficientes" and NO rows change (atomicity).
4. Transfer to the same warehouse → rejected.

## Machinery

5. **Maquinaria**: 2 seeded machines. Tractor detail shows 2026-06-05 log:
   4.00 h, Q23.00 fuel → 123.0000 total (4×25 + 23).
6. Log usage linked to an activity → that activity's machine cost and total
   rise by the log total (check Actividades list / dashboard); delete the log
   → costs return to the previous values.
7. Work orders: create a "Máquina" order with the tractor assigned → machine
   name shows in the list.

## Planning calendar

8. **Planificación**: July 2026 shows 3 seeded chips (Fertilización 07-10,
   Chapoda 07-18, Riego 07-05); summary: 3 items, 280.00 estimated.
9. Convert the Riego item → chip turns green/converted; a new activity with
   the same date/type/parcel exists in Actividades. Convert again → error
   (no duplicate); DB: `SELECT count(*) FROM activities WHERE id =
   '01900000-0000-7000-8000-00000000da03';` → 1.
10. Cancel a planned item → gray chip; cancelled items can't be converted.

## Budgets & variance

11. **Presupuestos**: seeded "Presupuesto Café 2026" (year 2026, cycle Café
    2026-A). Detail: months 1–6 grid shows labor 120.0000 + input 80.0000;
    category totals labor 720 / input 480; grand total 1,200.
12. Variance section: actuals per month = the seeded Café-cycle activities'
    labor/input costs (× exchange rate snapshots); overspent cells red,
    underspent green; grand totals reconcile with the cost dashboard for the
    cycle.
13. Edit a cell (e.g. month 7 machine 50.00) → grid + variance update.

## Plan gating & isolation

14. vecino-sa (Semilla): Bodegas, Maquinaria, Planificación, Presupuestos all
    redirect to Plan y límites with the feature banner; direct POSTs rejected
    ("feature … not included").
15. finca-demo ids in vecino URLs → not found.

## Automated

`pnpm test` (26 tests incl. variance matrix) · `pnpm typecheck` · `pnpm build`
— green at Phase 5 close.
