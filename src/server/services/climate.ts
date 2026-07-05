import { and, asc, eq, gte } from "drizzle-orm";
import { db } from "@/lib/db";
import { climateReadings, farms } from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { newId } from "@/lib/ids";

export type ClimateReadingInput = {
  farmId: string;
  date: string;
  rainfallMm?: string | null;
  tempMinC?: string | null;
  tempMaxC?: string | null;
  humidityPct?: string | null;
};

/** Readings for a farm from `today - days` onward, ascending by date. */
export async function listClimateReadings(
  ctx: OrgContext,
  farmId: string,
  { days = 90 }: { days?: number } = {},
) {
  const since = new Date();
  since.setDate(since.getDate() - days);
  const sinceDate = since.toISOString().slice(0, 10);

  return db
    .select()
    .from(climateReadings)
    .where(
      and(
        eq(climateReadings.orgId, ctx.org.id),
        eq(climateReadings.farmId, farmId),
        gte(climateReadings.date, sinceDate),
      ),
    )
    .orderBy(asc(climateReadings.date));
}

/** Insert or update the manual reading for a farm/date (source stays "manual"). */
export async function upsertClimateReading(
  ctx: OrgContext,
  input: ClimateReadingInput,
) {
  assertCan(ctx, "climate", "create");

  const [farm] = await db
    .select({ id: farms.id })
    .from(farms)
    .where(and(eq(farms.id, input.farmId), eq(farms.orgId, ctx.org.id)))
    .limit(1);
  if (!farm) throw new Error("farm not found");

  const [reading] = await db
    .insert(climateReadings)
    .values({
      id: newId(),
      orgId: ctx.org.id,
      farmId: input.farmId,
      date: input.date,
      source: "manual",
      rainfallMm: input.rainfallMm ?? null,
      tempMinC: input.tempMinC ?? null,
      tempMaxC: input.tempMaxC ?? null,
      humidityPct: input.humidityPct ?? null,
    })
    .onConflictDoUpdate({
      target: [
        climateReadings.farmId,
        climateReadings.date,
        climateReadings.source,
      ],
      set: {
        rainfallMm: input.rainfallMm ?? null,
        tempMinC: input.tempMinC ?? null,
        tempMaxC: input.tempMaxC ?? null,
        humidityPct: input.humidityPct ?? null,
      },
    })
    .returning();
  return reading;
}

export async function deleteClimateReading(ctx: OrgContext, id: string) {
  assertCan(ctx, "climate", "delete");
  await db
    .delete(climateReadings)
    .where(
      and(eq(climateReadings.id, id), eq(climateReadings.orgId, ctx.org.id)),
    );
}
