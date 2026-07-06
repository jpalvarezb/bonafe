import { and, eq, gte, lte } from "drizzle-orm";
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import {
  activities,
  activityTypes,
  climateReadings,
  cropCycles,
} from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";

export type DailyRainfall = { date: string; rainfallMm: string | null };

// When multiple sources report the same farm/date, prefer the most reliable
// one: a physical station reading, then a manual entry, then satellite
// estimates (CHIRPS before Open-Meteo, matching climate-ingest provider
// priority for Phase 8).
const SOURCE_PRIORITY: Record<string, number> = {
  station: 0,
  manual: 1,
  chirps: 2,
  open_meteo: 3,
};

function dedupeBySourcePriority(
  rows: Array<{ date: string; source: string; rainfallMm: string | null }>,
): DailyRainfall[] {
  const byDate = new Map<
    string,
    { source: string; rainfallMm: string | null }
  >();
  for (const row of rows) {
    const existing = byDate.get(row.date);
    if (!existing) {
      byDate.set(row.date, { source: row.source, rainfallMm: row.rainfallMm });
      continue;
    }
    // A higher-priority row only wins the RAINFALL value when it actually has
    // one — a temp-only manual reading must not mask real satellite rainfall
    // by shadowing the date with a null.
    const rowPriority = SOURCE_PRIORITY[row.source] ?? 99;
    const existingPriority = SOURCE_PRIORITY[existing.source] ?? 99;
    const rowWins =
      existing.rainfallMm == null
        ? row.rainfallMm != null || rowPriority < existingPriority
        : row.rainfallMm != null && rowPriority < existingPriority;
    if (rowWins) {
      byDate.set(row.date, { source: row.source, rainfallMm: row.rainfallMm });
    }
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, v]) => ({ date, rainfallMm: v.rainfallMm }));
}

/**
 * Daily rainfall for a farm over [from, to] (inclusive), deduped by
 * source-priority when multiple readings exist for the same date.
 */
export async function dailyRainfallForFarm(
  ctx: OrgContext,
  farmId: string,
  from: string,
  to: string,
): Promise<DailyRainfall[]> {
  const rows = await db
    .select({
      date: climateReadings.date,
      source: climateReadings.source,
      rainfallMm: climateReadings.rainfallMm,
    })
    .from(climateReadings)
    .where(
      and(
        eq(climateReadings.orgId, ctx.org.id),
        eq(climateReadings.farmId, farmId),
        gte(climateReadings.date, from),
        lte(climateReadings.date, to),
      ),
    );
  return dedupeBySourcePriority(rows);
}

export type CycleRainfallAccumulation = {
  totalMm: string;
  days: number;
  from: string;
  to: string;
  /** Convenience for callers that need to fetch the same farm's daily rows. */
  farmId: string;
  daily: DailyRainfall[];
};

/**
 * Accumulated rainfall for a cycle's farm, from the cycle's startDate to
 * min(endDate ?? today, today). Validates the cycle belongs to the org.
 */
export async function cycleRainfallAccumulation(
  ctx: OrgContext,
  cycleId: string,
): Promise<CycleRainfallAccumulation> {
  const [cycle] = await db
    .select({
      id: cropCycles.id,
      farmId: cropCycles.farmId,
      startDate: cropCycles.startDate,
      endDate: cropCycles.endDate,
    })
    .from(cropCycles)
    .where(and(eq(cropCycles.id, cycleId), eq(cropCycles.orgId, ctx.org.id)))
    .limit(1);
  if (!cycle) throw new Error("cycle not found");

  const today = new Date().toISOString().slice(0, 10);
  const to = cycle.endDate && cycle.endDate < today ? cycle.endDate : today;
  const from = cycle.startDate;

  const daily = await dailyRainfallForFarm(ctx, cycle.farmId, from, to);
  const total = daily.reduce(
    (acc, row) => acc.add(new Decimal(row.rainfallMm ?? 0)),
    new Decimal(0),
  );

  return {
    totalMm: total.toFixed(1),
    days: daily.length,
    from,
    to,
    farmId: cycle.farmId,
    daily,
  };
}

export type TimelineActivity = { date: string; typeName: string };

/** The cycle's activities as {date, typeName}, org-scoped. */
export async function activitiesForTimeline(
  ctx: OrgContext,
  cycleId: string,
): Promise<TimelineActivity[]> {
  const [cycle] = await db
    .select({ id: cropCycles.id })
    .from(cropCycles)
    .where(and(eq(cropCycles.id, cycleId), eq(cropCycles.orgId, ctx.org.id)))
    .limit(1);
  if (!cycle) throw new Error("cycle not found");

  return db
    .select({
      date: activities.date,
      typeName: activityTypes.name,
    })
    .from(activities)
    .innerJoin(activityTypes, eq(activities.activityTypeId, activityTypes.id))
    .where(
      and(eq(activities.orgId, ctx.org.id), eq(activities.cropCycleId, cycleId)),
    )
    .orderBy(activities.date);
}
