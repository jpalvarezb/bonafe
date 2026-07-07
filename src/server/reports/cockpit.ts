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

const MONITORING_WINDOW_DAYS = 60;
const OPEN_WORK_ORDER_STATUSES = new Set(["draft", "assigned", "in_progress"]);

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

export type CockpitData = {
  farmId: string;
  farmName: string;
  parcels: CockpitParcel[];
  monitoringPins: CockpitMonitoringPin[];
  workOrders: CockpitWorkOrderMarker[];
  kpi: CockpitKpi;
};

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Assembles every data slice the map cockpit needs for one farm. Each slice
 * is its own top-level `withOrgRls` call (never nested) — the first wave
 * runs in parallel via Promise.all, and a second wave (per-parcel recent
 * activities + per-cycle rainfall) runs after the first wave resolves,
 * because it needs the farm's parcel/cycle ids. Bounded by the farm's
 * parcel count (typically <=10 for the demo org), same shape as
 * cycleRainfallAccumulation's own per-farm daily query.
 */
export async function cockpitData(
  ctx: OrgContext,
  farmId: string,
): Promise<CockpitData> {
  const [farmRow, parcelRows, cycleRows, costRows, profitabilityRows, monitoringRows, workOrderRows, centroids] =
    await Promise.all([
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
  };
}
