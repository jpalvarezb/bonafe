import Decimal from "decimal.js";
import type { OrgContext } from "@/lib/tenancy";
import { costPerHa } from "@/lib/calc/costs";
import { costByParcel } from "@/server/reports/costs";
import { cycleProfitabilityReport } from "@/server/reports/profitability";
import { dailyRainfallForFarm } from "@/server/reports/climate";
import { listFarms } from "@/server/services/farms";
import { listActivities } from "@/server/services/activities";
import { listWorkOrders, type WorkOrderStatus } from "@/server/services/work-orders";
import { listAttendanceRange } from "@/server/services/attendance";

const RAINFALL_WINDOW_DAYS = 30;
const RECENT_ACTIVITIES_LIMIT = 5;
const OPEN_WORK_ORDER_STATUSES = new Set<WorkOrderStatus>([
  "draft",
  "assigned",
  "in_progress",
]);
const OPEN_WORK_ORDER_LIMIT = 5;

export type PanelKpi = {
  income: string;
  costs: string;
  profit: string;
  marginPct: string | null;
  /** costByParcel basis: parcel-table total cost ÷ parcel-table total area —
   * the SAME base as the table and the "{area} ha con costos" sublabel, so
   * this cell never mixes the profitability-report basis into a per-ha
   * figure (INGRESOS/COSTOS/MARGEN stay on the profitability basis so
   * income − costs = margin holds, per board 1b). */
  costPerHa: string | null;
  /** Sum of costByParcel's areaHa — only parcels with at least one logged
   * activity are counted (costByParcel is an inner join on activities). */
  totalAreaHa: string;
  /** Count of cycleProfitabilityReport rows with income > 0 — KPI-strip
   * substitute for the board's freeform "venta café pergamino" sublabel,
   * which needs a per-sale description no report exposes. */
  incomeCycleCount: number;
  /** cycleProfitabilityReport row count — the COSTOS sum spans EVERY cycle
   * the org has (the report exposes no status filter), so the sublabel
   * counts that same all-cycles scope instead of implying "active only". */
  totalCycleCount: number;
  /** Attendance rows in the current quincena with status present/half_day —
   * substitutes for a dedicated "jornales" report, which doesn't exist. */
  jornales: number;
  /** Distinct workers with an attendance row in the current quincena. */
  activeWorkerCount: number;
  quincenaFrom: string;
  quincenaTo: string;
};

export type PanelParcelRow = {
  parcelId: string;
  parcelName: string;
  farmName: string;
  /** Resolved by matching costByParcel's farmName against listFarms — best
   * effort (costByParcel doesn't return farmId); null if no unique match. */
  farmId: string | null;
  areaHa: string | null;
  totalCost: string;
  costPerHa: string | null;
};

export type PanelActivityRow = {
  id: string;
  date: string;
  typeName: string;
  parcelId: string | null;
  parcelName: string | null;
  farmId: string | null;
  cost: string;
};

export type PanelRainfallDay = { date: string; mm: number };

export type PanelRainfall = {
  farmId: string;
  farmName: string;
  daily: PanelRainfallDay[];
  totalMm: string;
  maxMm: string;
  daysWithData: number;
  windowDays: number;
  from: string;
  to: string;
};

export type PanelOpenWorkOrder = {
  id: string;
  code: string;
  title: string;
  status: "draft" | "assigned" | "in_progress";
};

/** Footer row of the cost-by-parcel table, Decimal-composed server-side so
 * the component never does float arithmetic on money strings. */
export type PanelParcelTotals = {
  areaHa: string;
  totalCost: string;
  costPerHa: string | null;
};

export type PanelData = {
  kpi: PanelKpi;
  parcelRows: PanelParcelRow[];
  parcelTotals: PanelParcelTotals;
  activityRows: PanelActivityRow[];
  rainfall: PanelRainfall | null;
  openWorkOrders: PanelOpenWorkOrder[];
};

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

function isoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return isoDate(d);
}

/** Current fortnight (1st–15th or 16th–end of month), UTC-based. */
function quincenaRange(today = new Date()): { from: string; to: string } {
  const year = today.getUTCFullYear();
  const month = today.getUTCMonth();
  const day = today.getUTCDate();
  if (day <= 15) {
    return { from: `${year}-${pad2(month + 1)}-01`, to: `${year}-${pad2(month + 1)}-15` };
  }
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return {
    from: `${year}-${pad2(month + 1)}-16`,
    to: `${year}-${pad2(month + 1)}-${pad2(lastDay)}`,
  };
}

/**
 * Composes the office panel dashboard's data out of existing report/service
 * functions only (no new schema/db access — see module doc in
 * dashboard-panel.tsx for why). Two waves like cockpit.ts's cockpitData:
 * the first wave is independent top-level withOrgRls calls run in parallel;
 * the second wave (rainfall + attendance) depends on the first wave's farm
 * list / quincena window and runs after it resolves.
 */
export async function panelData(ctx: OrgContext): Promise<PanelData> {
  const quincena = quincenaRange();
  const rainfallFrom = isoDaysAgo(RAINFALL_WINDOW_DAYS - 1);
  const rainfallTo = isoDaysAgo(0);

  const [profitRows, costRows, farms, activityRows, workOrderRows] =
    await Promise.all([
      cycleProfitabilityReport(ctx),
      costByParcel(ctx),
      listFarms(ctx),
      listActivities(ctx, { limit: RECENT_ACTIVITIES_LIMIT }),
      listWorkOrders(ctx, { excludeCancelled: true }),
    ]);

  const primaryFarm = farms[0] ?? null;
  const [rainfallDaily, attendanceRows] = await Promise.all([
    primaryFarm
      ? dailyRainfallForFarm(ctx, primaryFarm.id, rainfallFrom, rainfallTo)
      : Promise.resolve([]),
    listAttendanceRange(ctx, quincena),
  ]);

  // Org-wide KPI totals: same Decimal-over-strings composition as
  // cockpit.ts's farm KPI, just summed over every row the org-wide report
  // returns (cycleProfitabilityReport has no status filter, so this
  // includes non-active cycles too — there is no cheaper way to scope to
  // "active only" without a new query).
  let income = new Decimal(0);
  let costs = new Decimal(0);
  let profit = new Decimal(0);
  let incomeCycleCount = 0;
  for (const row of profitRows) {
    income = income.add(row.income);
    costs = costs.add(row.totalCost);
    profit = profit.add(row.profit);
    if (new Decimal(row.income).gt(0)) incomeCycleCount += 1;
  }

  // Parcel-table totals (costByParcel basis) — Decimal end to end. These
  // feed both the table's footer row and the COSTO/HA KPI cell, so the KPI
  // and the table always agree with each other by construction.
  let totalAreaHa = new Decimal(0);
  let parcelTotalCost = new Decimal(0);
  for (const row of costRows) {
    totalAreaHa = totalAreaHa.add(new Decimal(row.areaHa ?? 0));
    parcelTotalCost = parcelTotalCost.add(new Decimal(row.totalCost ?? 0));
  }
  const parcelCostPerHa = totalAreaHa.gt(0)
    ? parcelTotalCost.div(totalAreaHa).toFixed(2)
    : null;

  const workerIds = new Set<string>();
  let jornales = 0;
  for (const row of attendanceRows) {
    if (row.record.status === "present" || row.record.status === "half_day") {
      jornales += 1;
      workerIds.add(row.record.workerId);
    }
  }

  const kpi: PanelKpi = {
    income: income.toFixed(2),
    costs: costs.toFixed(2),
    profit: profit.toFixed(2),
    marginPct: income.gt(0) ? profit.div(income).mul(100).toFixed(2) : null,
    costPerHa: parcelCostPerHa,
    totalAreaHa: totalAreaHa.toFixed(2),
    incomeCycleCount,
    totalCycleCount: profitRows.length,
    jornales,
    activeWorkerCount: workerIds.size,
    quincenaFrom: quincena.from,
    quincenaTo: quincena.to,
  };

  const parcelTotals: PanelParcelTotals = {
    areaHa: totalAreaHa.toFixed(2),
    totalCost: parcelTotalCost.toFixed(2),
    costPerHa: parcelCostPerHa,
  };

  const farmIdByName = new Map(farms.map((f) => [f.name, f.id]));
  const parcelRows: PanelParcelRow[] = costRows.map((row) => ({
    parcelId: row.parcelId,
    parcelName: row.parcelName,
    farmName: row.farmName,
    farmId: farmIdByName.get(row.farmName) ?? null,
    areaHa: row.areaHa,
    totalCost: row.totalCost ?? "0",
    costPerHa: costPerHa(row.totalCost ?? "0", row.areaHa),
  }));

  const panelActivityRows: PanelActivityRow[] = activityRows.map((row) => ({
    id: row.activity.id,
    date: row.activity.date,
    typeName: row.typeName,
    parcelId: row.activity.parcelId,
    parcelName: row.parcelName,
    farmId: row.farmName ? (farmIdByName.get(row.farmName) ?? null) : null,
    cost: row.activity.totalCost,
  }));

  let rainfall: PanelRainfall | null = null;
  if (primaryFarm) {
    const byDate = new Map(rainfallDaily.map((r) => [r.date, r.rainfallMm]));
    const daily: PanelRainfallDay[] = [];
    let total = new Decimal(0);
    let max = new Decimal(0);
    let daysWithData = 0;
    for (let i = RAINFALL_WINDOW_DAYS - 1; i >= 0; i--) {
      const date = isoDaysAgo(i);
      const raw = byDate.get(date) ?? null;
      const mm = raw != null ? Number(raw) : 0;
      if (raw != null) daysWithData += 1;
      daily.push({ date, mm });
      const dec = new Decimal(mm);
      total = total.add(dec);
      if (dec.gt(max)) max = dec;
    }
    rainfall = {
      farmId: primaryFarm.id,
      farmName: primaryFarm.name,
      daily,
      totalMm: total.toFixed(1),
      maxMm: max.toFixed(1),
      daysWithData,
      windowDays: RAINFALL_WINDOW_DAYS,
      from: rainfallFrom,
      to: rainfallTo,
    };
  }

  const openWorkOrders: PanelOpenWorkOrder[] = workOrderRows
    .filter((row) => OPEN_WORK_ORDER_STATUSES.has(row.workOrder.status))
    .slice(0, OPEN_WORK_ORDER_LIMIT)
    .map((row) => ({
      id: row.workOrder.id,
      code: row.workOrder.code,
      title: row.workOrder.title,
      status: row.workOrder.status as "draft" | "assigned" | "in_progress",
    }));

  return {
    kpi,
    parcelRows,
    parcelTotals,
    activityRows: panelActivityRows,
    rainfall,
    openWorkOrders,
  };
}
