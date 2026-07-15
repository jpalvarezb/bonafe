import { and, eq } from "drizzle-orm";
import Decimal from "decimal.js";
import { withOrgRls } from "@/lib/db/rls";
import {
  cropCycles,
  crops,
  cropStages,
  farms,
  parcels,
} from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import type { GeoJsonPolygon } from "@/lib/db/geometry";
import { costPerHa } from "@/lib/calc/costs";
import { costByParcel } from "@/server/reports/costs";
import { cycleProfitabilityReport } from "@/server/reports/profitability";
import { cycleRainfallAccumulation } from "@/server/reports/climate";
import { listMonitoring } from "@/server/services/monitoring";
import { listWorkOrders } from "@/server/services/work-orders";
import { listActivities } from "@/server/services/activities";
import { parcelCentroids } from "@/server/services/geo";
import { listPlannedActivities } from "@/server/services/planning";
import { laborByWorkerReport } from "@/server/services/payroll";
import { listAttendanceRange } from "@/server/services/attendance";
import { getOrgPlan, hasFeature } from "@/lib/plan-limits";

const MONITORING_WINDOW_DAYS = 60;
const OPEN_WORK_ORDER_STATUSES = new Set(["draft", "assigned", "in_progress"]);
const PLANNING_WINDOW_DAYS = 14;
const PLANNING_ITEM_LIMIT = 6;
const LABOR_TOP_WORKER_LIMIT = 4;

export type CockpitCycle = {
  id: string;
  name: string;
  cropName: string;
  stageName: string | null;
  startDate: string;
  plantedAreaHa: string | null;
};

export type CockpitParcelMargin = {
  income: string;
  /** Cycle-profitability total cost (activity + processing + piecework) —
   * deliberately NOT the same base as `CockpitParcel.totalCost` (activities
   * only, from costByParcel), so income - costs = profit holds here. */
  costs: string;
  profit: string;
  marginPct: string | null;
};

export type CockpitParcelRainfall = {
  totalMm: string;
  days: number;
};

export type CockpitParcelActivity = {
  id: string;
  date: string;
  typeName: string;
};

export type CockpitParcel = {
  id: string;
  name: string;
  boundary: GeoJsonPolygon | null;
  areaHa: string | null;
  totalCost: string;
  costPerHa: string | null;
  /** Every active cycle on this parcel (intercropping is legal). */
  cycles: CockpitCycle[];
  /** cycles[0] by most-recent startDate — drives coloring/rail headline. */
  primaryCycle: CockpitCycle | null;
  margin: CockpitParcelMargin | null;
  rainfall: CockpitParcelRainfall | null;
  recentActivities: CockpitParcelActivity[];
};

export type CockpitMonitoringPin = {
  id: string;
  parcelId: string;
  type: "pest" | "disease" | "weed";
  agentName: string;
  severity: number;
  date: string;
  lng: number;
  lat: number;
};

export type CockpitWorkOrderMarker = {
  id: string;
  code: string;
  title: string;
  status: "draft" | "assigned" | "in_progress";
  parcelId: string;
  lng: number;
  lat: number;
};

export type CockpitKpi = {
  income: string;
  costs: string;
  profit: string;
  marginPct: string | null;
  costPerHa: string | null;
};

export type CockpitPlanningItem = {
  id: string;
  date: string;
  typeName: string;
  parcelName: string | null;
};

export type CockpitPlanning = {
  windowDays: number;
  upcoming: CockpitPlanningItem[];
};

export type CockpitLaborDay = {
  date: string;
  status: "present" | "half_day" | "absent" | "sick" | "leave" | null;
};

export type CockpitLaborWorker = {
  workerId: string;
  workerName: string;
  daysWorked: string;
  days: CockpitLaborDay[];
};

export type CockpitLabor = {
  quincenaFrom: string;
  quincenaTo: string;
  topWorkers: CockpitLaborWorker[];
};

export type CockpitData = {
  farmId: string;
  farmName: string;
  parcels: CockpitParcel[];
  monitoringPins: CockpitMonitoringPin[];
  workOrders: CockpitWorkOrderMarker[];
  kpi: CockpitKpi;
  /** null when the org's plan doesn't include the "planning" feature — the
   * planning service calls are skipped entirely in that case, not just
   * hidden client-side. */
  planning: CockpitPlanning | null;
  /** null when the org's plan doesn't include the "labor" feature — same
   * skip-entirely gating as `planning`. */
  labor: CockpitLabor | null;
  /** Farm-total rainfall for the no-selection rail. Rainfall rows are
   * farm-scoped and every active cycle's accumulation window ends today, so
   * the union of active-cycle windows collapses to the earliest-started
   * cycle's window — its accumulation IS the farm totality since active
   * production began. Null when the farm has no active cycle (or no
   * rainfall rows yet). */
  farmRainfall: CockpitParcelRainfall | null;
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}

// Byte-identical copy of quincenaRange() from src/server/reports/panel.ts —
// no shared date lib exists in this repo, so per-file duplication is the
// established precedent (see panel.ts's own copy of isoDaysAgo/isoDate).
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

/** Every calendar day in [from, to] (inclusive), as ISO date strings. Walked
 * in UTC ms steps so the list never gains/loses a day to DST — quincenas are
 * at most 16 days so no cap is needed (contrast payroll's period page, which
 * caps at 62 for arbitrary custom ranges). */
function quincenaDayList(from: string, to: string): string[] {
  const days: string[] = [];
  const start = Date.parse(`${from}T00:00:00Z`);
  const end = Date.parse(`${to}T00:00:00Z`);
  for (let ts = start; ts <= end; ts += 86_400_000) {
    days.push(new Date(ts).toISOString().slice(0, 10));
  }
  return days;
}

/**
 * Calendar-month tuples (year, month) covering [today, today+windowDays] —
 * 1 tuple normally, 2 when the window crosses a month boundary (including a
 * December -> January year rollover, since `setUTCDate` normalizes month
 * and year overflow for us). Pure/exported so it can be unit-tested without
 * a database.
 */
export function planningWindowMonths(
  today: Date,
): { year: number; month: number }[] {
  const start = { year: today.getUTCFullYear(), month: today.getUTCMonth() + 1 };
  const end = new Date(today);
  end.setUTCDate(end.getUTCDate() + PLANNING_WINDOW_DAYS);
  const endTuple = { year: end.getUTCFullYear(), month: end.getUTCMonth() + 1 };
  if (start.year === endTuple.year && start.month === endTuple.month) {
    return [start];
  }
  return [start, endTuple];
}

/** Upcoming planned activities in [today, today+PLANNING_WINDOW_DAYS], across
 * the 1-2 calendar months the window spans (own top-level withOrgRls calls,
 * fanned out via Promise.all — see listPlannedActivities). */
async function loadCockpitPlanning(ctx: OrgContext): Promise<CockpitPlanning> {
  // Single `now` snapshot for both the ISO window bounds and the month
  // tuples below, so a call straddling a UTC midnight tick can't disagree
  // with itself (same isoDaysAgo/setUTCDate UTC convention as the rest of
  // this file).
  const now = new Date();
  const todayISO = now.toISOString().slice(0, 10);
  const windowEnd = new Date(now);
  windowEnd.setUTCDate(windowEnd.getUTCDate() + PLANNING_WINDOW_DAYS);
  const endISO = windowEnd.toISOString().slice(0, 10);
  const months = planningWindowMonths(now);

  const monthResults = await Promise.all(
    months.map((tuple) => listPlannedActivities(ctx, tuple)),
  );

  const upcoming: CockpitPlanningItem[] = monthResults
    .flatMap((result) => result.rows)
    .filter(
      (row) =>
        row.plan.status === "planned" &&
        row.plan.plannedDate >= todayISO &&
        row.plan.plannedDate <= endISO,
    )
    // localeCompare returns 0 on same-day ties so the stable sort preserves
    // the (plannedDate, createdAt) order the service already emitted.
    .sort((a, b) => a.plan.plannedDate.localeCompare(b.plan.plannedDate))
    .slice(0, PLANNING_ITEM_LIMIT)
    .map((row) => ({
      id: row.plan.id,
      date: row.plan.plannedDate,
      typeName: row.typeName,
      parcelName: row.parcelName,
    }));

  return { windowDays: PLANNING_WINDOW_DAYS, upcoming };
}

/** Top workers by days worked in the current quincena, with a per-day
 * attendance strip (board-1i "DÍAS MARCADOS" treatment). Two of its own
 * top-level withOrgRls calls, run in parallel via Promise.all. */
async function loadCockpitLabor(ctx: OrgContext): Promise<CockpitLabor> {
  const quincena = quincenaRange();

  const [workerRows, attendanceRows] = await Promise.all([
    laborByWorkerReport(ctx, quincena),
    listAttendanceRange(ctx, quincena),
  ]);

  const statusByWorkerDay = new Map<string, CockpitLaborDay["status"]>();
  for (const row of attendanceRows) {
    statusByWorkerDay.set(
      `${row.record.workerId}|${row.record.date}`,
      row.record.status as CockpitLaborDay["status"],
    );
  }

  const days = quincenaDayList(quincena.from, quincena.to);
  const topWorkers: CockpitLaborWorker[] = [...workerRows]
    .sort((a, b) => Number(b.daysWorked) - Number(a.daysWorked))
    .slice(0, LABOR_TOP_WORKER_LIMIT)
    .map((worker) => ({
      workerId: worker.workerId,
      workerName: worker.workerName,
      daysWorked: worker.daysWorked,
      days: days.map((date) => ({
        date,
        status: statusByWorkerDay.get(`${worker.workerId}|${date}`) ?? null,
      })),
    }));

  return { quincenaFrom: quincena.from, quincenaTo: quincena.to, topWorkers };
}

/**
 * Assembles every data slice the map cockpit needs for one farm. Each slice
 * is its own top-level `withOrgRls` call (never nested) — the farm/parcel/
 * cycle/cost/monitoring/work-order/centroid wave runs in parallel via
 * Promise.all alongside the feature-gated planning and labor waves (they
 * need none of that wave's ids), all inside one outer Promise.all. A further
 * second wave (per-parcel recent activities + per-cycle rainfall) runs after
 * the first wave resolves, because it needs the farm's parcel/cycle ids.
 * Bounded by the farm's parcel count (typically <=10 for the demo org), same
 * shape as cycleRainfallAccumulation's own per-farm daily query.
 */
export async function cockpitData(
  ctx: OrgContext,
  farmId: string,
): Promise<CockpitData> {
  // Feature gate first (cheap, React cache()d): when a feature is absent,
  // its whole service-call wave below is skipped, not just hidden.
  const plan = await getOrgPlan(ctx.org.id);
  const planningEnabled = hasFeature(plan, "planning");
  const laborEnabled = hasFeature(plan, "labor");

  const [
    [farmRow, parcelRows, cycleRows, costRows, profitabilityRows, monitoringRows, workOrderRows, centroids],
    planning,
    labor,
  ] = await Promise.all([
    Promise.all([
      withOrgRls(ctx.org.id, (tx) =>
        tx
          .select({ id: farms.id, name: farms.name })
          .from(farms)
          .where(and(eq(farms.id, farmId), eq(farms.orgId, ctx.org.id)))
          .limit(1),
      ),
      withOrgRls(ctx.org.id, (tx) =>
        tx
          .select({
            id: parcels.id,
            name: parcels.name,
            boundary: parcels.boundary,
            areaHa: parcels.areaHa,
          })
          .from(parcels)
          .where(
            and(
              eq(parcels.orgId, ctx.org.id),
              eq(parcels.farmId, farmId),
              eq(parcels.active, true),
            ),
          )
          .orderBy(parcels.name),
      ),
      withOrgRls(ctx.org.id, (tx) =>
        tx
          .select({
            id: cropCycles.id,
            parcelId: cropCycles.parcelId,
            name: cropCycles.name,
            cropName: crops.name,
            stageName: cropStages.name,
            startDate: cropCycles.startDate,
            plantedAreaHa: cropCycles.plantedAreaHa,
          })
          .from(cropCycles)
          .innerJoin(crops, eq(cropCycles.cropId, crops.id))
          .leftJoin(cropStages, eq(cropCycles.currentStageId, cropStages.id))
          .where(
            and(
              eq(cropCycles.orgId, ctx.org.id),
              eq(cropCycles.farmId, farmId),
              eq(cropCycles.status, "active"),
            ),
          )
          .orderBy(cropCycles.startDate),
      ),
      costByParcel(ctx),
      cycleProfitabilityReport(ctx),
      listMonitoring(ctx),
      listWorkOrders(ctx),
      parcelCentroids(ctx, farmId),
    ]),
    // Secondary rail widgets must never take down the map: a transient
    // failure here degrades to a hidden widget (null), unlike the core wave
    // above which stays fail-fast.
    planningEnabled
      ? loadCockpitPlanning(ctx).catch(() => null)
      : Promise.resolve(null),
    laborEnabled ? loadCockpitLabor(ctx).catch(() => null) : Promise.resolve(null),
  ]);

  const farm = farmRow[0];
  if (!farm) throw new Error("farm not found");

  const parcelIds = new Set(parcelRows.map((p) => p.id));

  // Group active cycles per parcel, most-recent startDate first (primary).
  const cyclesByParcel = new Map<string, CockpitCycle[]>();
  for (const row of cycleRows) {
    const cycle: CockpitCycle = {
      id: row.id,
      name: row.name,
      cropName: row.cropName,
      stageName: row.stageName,
      startDate: row.startDate,
      plantedAreaHa: row.plantedAreaHa,
    };
    const list = cyclesByParcel.get(row.parcelId) ?? [];
    list.push(cycle);
    cyclesByParcel.set(row.parcelId, list);
  }
  for (const list of cyclesByParcel.values()) {
    list.sort((a, b) => (a.startDate < b.startDate ? 1 : -1));
  }

  const costByParcelId = new Map(
    costRows
      .filter((r) => parcelIds.has(r.parcelId))
      .map((r) => [r.parcelId, r.totalCost ?? "0"]),
  );
  const profitabilityByCycleId = new Map(
    profitabilityRows.map((r) => [r.cycleId, r]),
  );

  // Second wave: bounded per-parcel/per-cycle fan-out, needs the ids above.
  const [activitiesByParcel, rainfallByCycle] = await Promise.all([
    Promise.all(
      parcelRows.map(async (parcel) => {
        const rows = await listActivities(ctx, {
          parcelId: parcel.id,
          limit: 3,
        });
        return [
          parcel.id,
          rows.map((r) => ({
            id: r.activity.id,
            date: r.activity.date,
            typeName: r.typeName,
          })),
        ] as const;
      }),
    ),
    Promise.all(
      [...cyclesByParcel.values()]
        .map((list) => list[0])
        .filter((primary): primary is CockpitCycle => primary != null)
        .map(async (primary) => {
          try {
            const accumulation = await cycleRainfallAccumulation(ctx, primary.id);
            return [
              primary.id,
              { totalMm: accumulation.totalMm, days: accumulation.days },
            ] as const;
          } catch {
            // Defensive: a cycle whose farm has no rainfall rows yet (or any
            // other lookup failure) must not blow up the whole cockpit.
            return [primary.id, null] as const;
          }
        }),
    ),
  ]);
  const activitiesByParcelId = new Map(activitiesByParcel);
  const rainfallByCycleId = new Map(rainfallByCycle);

  // See CockpitData.farmRainfall: earliest active cycle's window = the union
  // of all active windows, so its accumulation is the farm total. Usually
  // already fetched above (earliest is a primary cycle far more often than
  // not); the fallback fetch covers a parcel whose newer cycle displaced it.
  const earliestActiveCycle = cycleRows.reduce<(typeof cycleRows)[number] | null>(
    (earliest, row) =>
      earliest == null || row.startDate < earliest.startDate ? row : earliest,
    null,
  );
  let farmRainfall: CockpitParcelRainfall | null = null;
  if (earliestActiveCycle) {
    const fetched = rainfallByCycleId.get(earliestActiveCycle.id);
    if (fetched !== undefined) {
      farmRainfall = fetched;
    } else {
      try {
        const accumulation = await cycleRainfallAccumulation(
          ctx,
          earliestActiveCycle.id,
        );
        farmRainfall = {
          totalMm: accumulation.totalMm,
          days: accumulation.days,
        };
      } catch {
        farmRainfall = null;
      }
    }
  }

  const cockpitParcels: CockpitParcel[] = parcelRows.map((parcel) => {
    const cycles = cyclesByParcel.get(parcel.id) ?? [];
    const primaryCycle = cycles[0] ?? null;
    const totalCost = costByParcelId.get(parcel.id) ?? "0";
    const profitability = primaryCycle
      ? profitabilityByCycleId.get(primaryCycle.id)
      : undefined;
    const margin: CockpitParcelMargin | null =
      profitability && new Decimal(profitability.income).gt(0)
        ? {
            income: profitability.income,
            costs: profitability.totalCost,
            profit: profitability.profit,
            marginPct: profitability.marginPct,
          }
        : null;

    return {
      id: parcel.id,
      name: parcel.name,
      boundary: parcel.boundary as GeoJsonPolygon | null,
      areaHa: parcel.areaHa,
      totalCost,
      costPerHa: costPerHa(totalCost, parcel.areaHa),
      cycles,
      primaryCycle,
      margin,
      rainfall: primaryCycle
        ? (rainfallByCycleId.get(primaryCycle.id) ?? null)
        : null,
      recentActivities: activitiesByParcelId.get(parcel.id) ?? [],
    };
  });

  const cutoff = isoDaysAgo(MONITORING_WINDOW_DAYS);
  const monitoringPins: CockpitMonitoringPin[] = monitoringRows
    .filter(
      (row) =>
        parcelIds.has(row.record.parcelId) &&
        row.record.location != null &&
        row.record.date >= cutoff,
    )
    .map((row) => ({
      id: row.record.id,
      parcelId: row.record.parcelId,
      type: row.record.type,
      agentName: row.record.agentName,
      severity: row.record.severity,
      date: row.record.date,
      lng: row.record.location!.coordinates[0],
      lat: row.record.location!.coordinates[1],
    }));

  const centroidByParcelId = new Map(
    centroids.map((c) => [c.parcelId, c]),
  );
  const workOrders: CockpitWorkOrderMarker[] = workOrderRows
    .filter(
      (row) =>
        row.workOrder.parcelId != null &&
        parcelIds.has(row.workOrder.parcelId) &&
        OPEN_WORK_ORDER_STATUSES.has(row.workOrder.status),
    )
    .map((row) => {
      const centroid = centroidByParcelId.get(row.workOrder.parcelId!);
      return centroid
        ? {
            id: row.workOrder.id,
            code: row.workOrder.code,
            title: row.workOrder.title,
            status: row.workOrder.status as "draft" | "assigned" | "in_progress",
            parcelId: row.workOrder.parcelId!,
            lng: centroid.lng,
            lat: centroid.lat,
          }
        : null;
    })
    .filter((marker): marker is CockpitWorkOrderMarker => marker != null);

  // Farm KPI totals: sum every farm active cycle's profitability (not just
  // per-parcel primaries — intercropped secondary cycles count too), using
  // Decimal on the report's string values throughout (no float money math).
  const farmCycleIds = cycleRows.map((r) => r.id);
  let income = new Decimal(0);
  let costs = new Decimal(0);
  let profit = new Decimal(0);
  for (const cycleId of farmCycleIds) {
    const row = profitabilityByCycleId.get(cycleId);
    if (!row) continue;
    income = income.add(row.income);
    costs = costs.add(row.totalCost);
    profit = profit.add(row.profit);
  }
  const totalAreaHa = parcelRows.reduce(
    (acc, p) => acc.add(new Decimal(p.areaHa ?? 0)),
    new Decimal(0),
  );
  const kpi: CockpitKpi = {
    income: income.toFixed(2),
    costs: costs.toFixed(2),
    profit: profit.toFixed(2),
    marginPct: income.gt(0) ? profit.div(income).mul(100).toFixed(2) : null,
    costPerHa: totalAreaHa.gt(0) ? costs.div(totalAreaHa).toFixed(2) : null,
  };

  return {
    farmId: farm.id,
    farmName: farm.name,
    parcels: cockpitParcels,
    monitoringPins,
    workOrders,
    kpi,
    planning,
    labor,
    farmRainfall,
  };
}
