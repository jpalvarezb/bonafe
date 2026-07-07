import { and, desc, eq } from "drizzle-orm";
import { withOrgRls } from "@/lib/db/rls";
import { cropCycles, harvests, parcels, workers } from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { assertOrgFeature } from "@/lib/plan-limits";
import { newId } from "@/lib/ids";

export type HarvestCreateInput = {
  /** Client-generated UUIDv7 for offline idempotency; server fills if absent. */
  id?: string;
  parcelId: string;
  cropCycleId?: string | null;
  workerId?: string | null;
  date: string;
  quantity: string;
  unit: string;
  qualityGrade?: string | null;
  notes?: string | null;
  createdOffline?: boolean;
};

export async function createHarvest(ctx: OrgContext, input: HarvestCreateInput) {
  assertCan(ctx, "harvest", "create");
  await assertOrgFeature(ctx.org.id, "harvest");

  return withOrgRls(ctx.org.id, async (tx) => {
    const [parcel] = await tx
      .select({ id: parcels.id, farmId: parcels.farmId, active: parcels.active })
      .from(parcels)
      .where(and(eq(parcels.id, input.parcelId), eq(parcels.orgId, ctx.org.id)))
      .limit(1);
    if (!parcel) throw new Error("parcel not found");
    if (!parcel.active) throw new Error("parcel is inactive");

    if (input.cropCycleId) {
      const [cycle] = await tx
        .select({ id: cropCycles.id })
        .from(cropCycles)
        .where(
          and(
            eq(cropCycles.id, input.cropCycleId),
            eq(cropCycles.orgId, ctx.org.id),
            eq(cropCycles.parcelId, input.parcelId),
          ),
        )
        .limit(1);
      if (!cycle) throw new Error("crop cycle not found");
    }

    if (input.workerId) {
      const [worker] = await tx
        .select({ id: workers.id })
        .from(workers)
        .where(and(eq(workers.id, input.workerId), eq(workers.orgId, ctx.org.id)))
        .limit(1);
      if (!worker) throw new Error("worker not found");
    }

    const harvestId = input.id ?? newId();
    const [created] = await tx
      .insert(harvests)
      .values({
        id: harvestId,
        orgId: ctx.org.id,
        farmId: parcel.farmId,
        parcelId: input.parcelId,
        cropCycleId: input.cropCycleId ?? null,
        workerId: input.workerId ?? null,
        date: input.date,
        quantity: input.quantity,
        unit: input.unit,
        qualityGrade: input.qualityGrade ?? null,
        notes: input.notes ?? null,
        createdBy: ctx.user.id,
        createdOffline: input.createdOffline ?? false,
      })
      .onConflictDoNothing({ target: harvests.id })
      .returning();

    // Idempotent replay from the offline outbox: row already exists.
    if (!created) {
      const [existing] = await tx
        .select()
        .from(harvests)
        .where(and(eq(harvests.id, harvestId), eq(harvests.orgId, ctx.org.id)));
      if (!existing) throw new Error("harvest id conflict");
      return existing;
    }
    return created;
  });
}

export async function listHarvests(
  ctx: OrgContext,
  filter?: { cropCycleId?: string; parcelId?: string },
) {
  return withOrgRls(ctx.org.id, (tx) =>
    tx
      .select({
        harvest: harvests,
        parcelName: parcels.name,
        cycleName: cropCycles.name,
        workerName: workers.name,
      })
      .from(harvests)
      .innerJoin(parcels, eq(harvests.parcelId, parcels.id))
      .leftJoin(cropCycles, eq(harvests.cropCycleId, cropCycles.id))
      .leftJoin(workers, eq(harvests.workerId, workers.id))
      .where(
        and(
          eq(harvests.orgId, ctx.org.id),
          filter?.cropCycleId
            ? eq(harvests.cropCycleId, filter.cropCycleId)
            : undefined,
          filter?.parcelId ? eq(harvests.parcelId, filter.parcelId) : undefined,
        ),
      )
      .orderBy(desc(harvests.date))
      .limit(200),
  );
}

export async function deleteHarvest(ctx: OrgContext, id: string) {
  assertCan(ctx, "harvest", "delete");
  await assertOrgFeature(ctx.org.id, "harvest");
  await withOrgRls(ctx.org.id, (tx) =>
    tx
      .delete(harvests)
      .where(and(eq(harvests.id, id), eq(harvests.orgId, ctx.org.id))),
  );
}
