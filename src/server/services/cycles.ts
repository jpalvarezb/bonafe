import { and, desc, eq, isNull, or } from "drizzle-orm";
import { withOrgRls } from "@/lib/db/rls";
import {
  cropCycles,
  cropStages,
  crops,
  cropVarieties,
  farms,
  parcels,
} from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { newId } from "@/lib/ids";
import { isExclusionViolation } from "@/lib/db/errors";

// Thrown when the crop_cycles_no_same_crop_overlap_excl EXCLUDE constraint
// (drizzle/0016_crop-cycle-overlap-guard.sql) rejects an insert/update: two
// cycles of the SAME crop on the SAME parcel with overlapping date ranges.
// Actions catch this by name and redirect with a translated error banner.
export class CycleOverlapError extends Error {
  constructor() {
    super("cycle overlaps an existing cycle of the same crop on this parcel");
    this.name = "CycleOverlapError";
  }
}

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
  return withOrgRls(ctx.org.id, async (tx) => {
    const [parcel] = await tx
      .select({ id: parcels.id, farmId: parcels.farmId, areaHa: parcels.areaHa })
      .from(parcels)
      .where(and(eq(parcels.id, input.parcelId), eq(parcels.orgId, ctx.org.id)))
      .limit(1);
    if (!parcel) throw new Error("parcel not found");

    try {
      const [created] = await tx
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
    } catch (error) {
      if (isExclusionViolation(error, "crop_cycles_no_same_crop_overlap_excl")) {
        throw new CycleOverlapError();
      }
      throw error;
    }
  });
}

export async function closeCycle(ctx: OrgContext, cycleId: string, endDate: string) {
  assertCan(ctx, "cycle", "update");
  return withOrgRls(ctx.org.id, async (tx) => {
    try {
      await tx
        .update(cropCycles)
        .set({ status: "closed", endDate })
        .where(and(eq(cropCycles.id, cycleId), eq(cropCycles.orgId, ctx.org.id)));
    } catch (error) {
      if (isExclusionViolation(error, "crop_cycles_no_same_crop_overlap_excl")) {
        throw new CycleOverlapError();
      }
      throw error;
    }
  });
}

/**
 * Sets (or clears) the cycle's current phenological stage. The stage must be
 * global-or-org visible and must belong to the cycle's own crop — a stage
 * from a different crop is rejected even if it's otherwise visible.
 */
export async function setCycleStage(
  ctx: OrgContext,
  cycleId: string,
  stageId: string | null,
) {
  assertCan(ctx, "cycle", "update");

  return withOrgRls(ctx.org.id, async (tx) => {
    const [cycle] = await tx
      .select({ id: cropCycles.id, cropId: cropCycles.cropId })
      .from(cropCycles)
      .where(and(eq(cropCycles.id, cycleId), eq(cropCycles.orgId, ctx.org.id)))
      .limit(1);
    if (!cycle) throw new Error("cycle not found");

    if (stageId) {
      const [stage] = await tx
        .select({ id: cropStages.id, cropId: cropStages.cropId })
        .from(cropStages)
        .where(
          and(
            eq(cropStages.id, stageId),
            or(isNull(cropStages.orgId), eq(cropStages.orgId, ctx.org.id)),
          ),
        )
        .limit(1);
      if (!stage) throw new Error("stage not found");
      if (stage.cropId !== cycle.cropId) {
        throw new Error("stage does not belong to the cycle's crop");
      }
    }

    const [updated] = await tx
      .update(cropCycles)
      .set({ currentStageId: stageId })
      .where(and(eq(cropCycles.id, cycleId), eq(cropCycles.orgId, ctx.org.id)))
      .returning();
    return updated;
  });
}

export async function listCycles(
  ctx: OrgContext,
  filter?: { parcelId?: string; status?: "planned" | "active" | "closed" },
) {
  return withOrgRls(ctx.org.id, (tx) =>
    tx
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
      .orderBy(desc(cropCycles.startDate)),
  );
}
