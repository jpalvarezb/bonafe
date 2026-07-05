import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  cropCycles,
  crops,
  cropVarieties,
  farms,
  parcels,
} from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { newId } from "@/lib/ids";

export type CycleInput = {
  parcelId: string;
  cropId: string;
  varietyId?: string | null;
  name: string;
  startDate: string;
  expectedEndDate?: string | null;
  plantedAreaHa?: string | null;
  plantCount?: number | null;
};

export async function createCycle(ctx: OrgContext, input: CycleInput) {
  assertCan(ctx, "cycle", "create");
  const [parcel] = await db
    .select({ id: parcels.id, farmId: parcels.farmId, areaHa: parcels.areaHa })
    .from(parcels)
    .where(and(eq(parcels.id, input.parcelId), eq(parcels.orgId, ctx.org.id)))
    .limit(1);
  if (!parcel) throw new Error("parcel not found");

  const [created] = await db
    .insert(cropCycles)
    .values({
      id: newId(),
      orgId: ctx.org.id,
      farmId: parcel.farmId,
      parcelId: parcel.id,
      cropId: input.cropId,
      varietyId: input.varietyId ?? null,
      name: input.name,
      startDate: input.startDate,
      expectedEndDate: input.expectedEndDate ?? null,
      plantedAreaHa: input.plantedAreaHa ?? parcel.areaHa,
      plantCount: input.plantCount ?? null,
      status: "active",
    })
    .returning();
  return created;
}

export async function closeCycle(ctx: OrgContext, cycleId: string, endDate: string) {
  assertCan(ctx, "cycle", "update");
  await db
    .update(cropCycles)
    .set({ status: "closed", endDate })
    .where(and(eq(cropCycles.id, cycleId), eq(cropCycles.orgId, ctx.org.id)));
}

export async function listCycles(
  ctx: OrgContext,
  filter?: { parcelId?: string; status?: "planned" | "active" | "closed" },
) {
  return db
    .select({
      cycle: cropCycles,
      cropName: crops.name,
      varietyName: cropVarieties.name,
      parcelName: parcels.name,
      farmName: farms.name,
    })
    .from(cropCycles)
    .innerJoin(crops, eq(cropCycles.cropId, crops.id))
    .leftJoin(cropVarieties, eq(cropCycles.varietyId, cropVarieties.id))
    .innerJoin(parcels, eq(cropCycles.parcelId, parcels.id))
    .innerJoin(farms, eq(cropCycles.farmId, farms.id))
    .where(
      and(
        eq(cropCycles.orgId, ctx.org.id),
        filter?.parcelId ? eq(cropCycles.parcelId, filter.parcelId) : undefined,
        filter?.status ? eq(cropCycles.status, filter.status) : undefined,
      ),
    )
    .orderBy(desc(cropCycles.startDate));
}
