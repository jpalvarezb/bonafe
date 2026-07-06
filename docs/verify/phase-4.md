# Phase 4 verification — Tier 2 (labor, payroll, harvests, inventory)

Setup as in phase-1.md (`docker compose up -d db`, `pnpm db:migrate && pnpm db:seed`,
`pnpm dev`). Login: owner@demo.agropeq.io / demo1234, org **finca-demo**.

## Workers & attendance

1. **Trabajadores**: 7 seeded workers; Carlos Machetero shows inactive. Create
   an 8th worker with daily rate 11.00 → appears in the list; deactivate and
   reactivate him.
2. **Asistencia**: navigate to 2026-06-17 (`?date=2026-06-17`) → 6 active
   workers, Pedro Obrero "Presente" with 2 overtime hours. Mark statuses for
   today per row — each save is instant (roll call style).
3. **Offline attendance**: DevTools → offline. Mark 3 workers → rows show
   amber pending, badge counts up, no crash. Reconnect → badge clears;
   re-marking the same worker+day twice ends with ONE row (upsert):
   `SELECT count(*) FROM attendance_records WHERE worker_id='...' AND date='...';` → 1.

## Payroll book (hand-computed fixture)

4. **Planilla**: create period "Quincena 2026-06 B", 2026-06-16 → 2026-06-29.
5. Open it → "Generar" → 6 entries. **Pedro Obrero: 10.50 days, 5.00 h extra,
   base 105.0000, overtime 7.5000, net 112.5000.** María Cortadora: 14 days ×
   9.00 = 126.0000. Luis Capataz: 14 × 12.00 = 168.0000.
6. Edit Pedro: bono 5.00, deducción 3.50 → net becomes **114.0000** (matches
   the payroll.test.ts fixture). Regenerate → bonus/deduction survive, net
   still 114.0000.
7. Close the period → totals frozen, forms disappear, period total = sum of
   nets. Attempting further edits has no server effect.

## Harvests

8. **Cosechas**: 12 seeded entries on Café 2026-A in "lata" (40, 43, … 73 →
   summary shows 678.00 lata). Filter by parcel Lote El Cedro.
9. **Offline harvest**: offline → log 2 harvests (e.g. 50 lata) → pending rows,
   stays on form; reconnect → they appear in the list, summary updates.
   Exactly-once: `SELECT count(*), count(DISTINCT id) FROM harvests;` equal.

## Purchases → inventory (weighted average fixture)

10. **Compras**: 2 seeded purchases from Agroservicio El Progreso (715.00 and
    350.00 USD). Suppliers CRUD under Compras → Proveedores.
11. **Inventario**: Urea 46% → stock **30.0000 qq, costo prom. 33.0000, valor
    990.0000** (20@32 + 10@35). Glifosato: 10 L @ 7.50 = 75.00.
12. Log an activity on Lote El Cedro using 5 qq Urea → inventory drops to
    25 qq, avg stays 33.0000, value 825.0000 (consumption at weighted avg).
13. New purchase: 10 qq Urea @ 30.00 → stock 35 qq, avg = (825+300)/35 =
    32.1429. Delete that purchase → stock/valuation revert.
14. Adjustment: salida 2 qq ("merma") → stock decrements; entry without unit
    cost enters at current average.

## Plan gating & isolation

15. Log in as vecino@demo.agropeq.io (org vecino-sa, plan Semilla): Workers,
    Attendance, Payroll, Harvests, Purchases, Inventory and the labor report
    all redirect to Plan y límites with the "feature not in plan" banner.
16. finca-demo ids pasted into vecino-sa URLs/forms → not found / rejected
    (tenant isolation).

## Reports

17. **Reporte de mano de obra** (sidebar): per-worker days/pay for the June
    fortnight match the payroll book; labor cost by activity type and by
    parcel are non-empty (seeded activities) and consistent with the cost
    dashboard.

## Automated

`pnpm test` (22 tests: costs, payroll incl. the 114.00 fixture, weighted-avg
inventory) · `pnpm typecheck` · `pnpm build` — all green at Phase 4 close.
