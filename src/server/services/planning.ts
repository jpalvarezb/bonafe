import { and, asc, eq, gte, isNull, lt, or } from "drizzle-orm";
import { withOrgRls, type Tx } from "@/lib/db/rls";
import {
  activityTypes,
  cropCycles,
  parcels,
  plannedActivities,
} from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { assertOrgFeature } from "@/lib/plan-limits";
import { newId } from "@/lib/ids";
import { createActivityInTx } from "@/server/services/activities";

export type PlannedActivityStatus = "planned" | "converted" | "cancelled";

export type PlannedActivityInput = {
  activityTypeId: string;
  plannedDate: string;
  parcelId?: string | null;
  cropCycleId?: string | null;
  description?: string | null;
  estimatedCost?: string;
};

/** [start, end) as ISO date strings — half-open range for a calendar month. */
function monthRange(year: number, month: number): { start: string; end: string } {
  const pad = (n: number) => String(n).padStart(2, "0");
  const start = `${year}-${pad(month)}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${pad(nextMonth)}-01`;
  return { start, end };
}

async function assertParcelInOrg(
  tx: Tx,
  ctx: OrgContext,
  parcelId: string,
): Promise<string> {
  const [parcel] = await tx
    .select({ farmId: parcels.farmId })
    .from(parcels)
    .where(and(eq(parcels.id, parcelId), eq(parcels.orgId, ctx.org.id)))
    .limit(1);
  if (!parcel) throw new Error("parcel not found");
  return parcel.farmId;
}

async function assertActivityTypeInOrg(
  tx: Tx,
  ctx: OrgContext,
  activityTypeId: string,
): Promise<void> {
  const [type] = await tx
    .select({ id: activityTypes.id })
    .from(activityTypes)
    .where(
      and(
        eq(activityTypes.id, activityTypeId),
        or(isNull(activityTypes.orgId), eq(activityTypes.orgId, ctx.org.id)),
      ),
    )
    .limit(1);
  if (!type) throw new Error("activity type not found");
}

async function assertCropCycleInOrg(
  tx: Tx,
  ctx: OrgContext,
  cropCycleId: string,
): Promise<void> {
  const [cycle] = await tx
    .select({ id: cropCycles.id })
    .from(cropCycles)
    .where(
      and(eq(cropCycles.id, cropCycleId), eq(cropCycles.orgId, ctx.org.id)),
    )
    .limit(1);
  if (!cycle) throw new Error("crop cycle not found");
}

/** Rows for a calendar month, joined for display, plus counts by status. */
export async function listPlannedActivities(
  ctx: OrgContext,
  { year, month }: { year: number; month: number },
) {
  const { start, end } = monthRange(year, month);

  return withOrgRls(ctx.org.id, async (tx) => {
    const rows = await tx
      .select({
        plan: plannedActivities,
        typeName: activityTypes.name,
        parcelName: parcels.name,
        cycleName: cropCycles.name,
      })
      .from(plannedActivities)
      .innerJoin(
        activityTypes,
        eq(plannedActivities.activityTypeId, activityTypes.id),
      )
      .leftJoin(parcels, eq(plannedActivities.parcelId, parcels.id))
      .leftJoin(cropCycles, eq(plannedActivities.cropCycleId, cropCycles.id))
      .where(
        and(
          eq(plannedActivities.orgId, ctx.org.id),
          gte(plannedActivities.plannedDate, start),
          lt(plannedActivities.plannedDate, end),
        ),
      )
      .orderBy(
        asc(plannedActivities.plannedDate),
        asc(plannedActivities.createdAt),
      );

    const counts: Record<PlannedActivityStatus, number> = {
      planned: 0,
      converted: 0,
      cancelled: 0,
    };
    for (const row of rows) {
      counts[row.plan.status as PlannedActivityStatus]++;
    }

    return { rows, counts };
  });
}

export type PlannedActivityRow = Awaited<
  ReturnType<typeof listPlannedActivities>
>["rows"][number];

export async function createPlannedActivity(
  ctx: OrgContext,
  input: PlannedActivityInput,
) {
  assertCan(ctx, "planning", "manage");
  await assertOrgFeature(ctx.org.id, "planning");

  return withOrgRls(ctx.org.id, async (tx) => {
    let farmId: string | null = null;
    if (input.parcelId) {
      farmId = await assertParcelInOrg(tx, ctx, input.parcelId);
    }

    await assertActivityTypeInOrg(tx, ctx, input.activityTypeId);

    if (input.cropCycleId) {
      await assertCropCycleInOrg(tx, ctx, input.cropCycleId);
    }

    const [created] = await tx
      .insert(plannedActivities)
      .values({
        id: newId(),
        orgId: ctx.org.id,
        farmId,
        parcelId: input.parcelId ?? null,
        cropCycleId: input.cropCycleId ?? null,
        activityTypeId: input.activityTypeId,
        plannedDate: input.plannedDate,
        description: input.description ?? null,
        estimatedCost: input.estimatedCost ?? "0",
        createdBy: ctx.user.id,
      })
      .returning();
    return created;
  });
}

export async function updatePlannedActivity(
  ctx: OrgContext,
  id: string,
  input: Partial<PlannedActivityInput>,
) {
  assertCan(ctx, "planning", "manage");
  await assertOrgFeature(ctx.org.id, "planning");

  return withOrgRls(ctx.org.id, async (tx) => {
    const [current] = await tx
      .select({ status: plannedActivities.status })
      .from(plannedActivities)
      .where(
        and(
          eq(plannedActivities.id, id),
          eq(plannedActivities.orgId, ctx.org.id),
        ),
      )
      .limit(1);
    if (!current) throw new Error("planned activity not found");
    if (current.status !== "planned") {
      throw new Error(`cannot update a ${current.status} planned activity`);
    }

    let farmId: string | null | undefined;
    if (input.parcelId !== undefined) {
      farmId = input.parcelId
        ? await assertParcelInOrg(tx, ctx, input.parcelId)
        : null;
    }
    if (input.activityTypeId !== undefined) {
      await assertActivityTypeInOrg(tx, ctx, input.activityTypeId);
    }
    if (input.cropCycleId) {
      await assertCropCycleInOrg(tx, ctx, input.cropCycleId);
    }

    const [updated] = await tx
      .update(plannedActivities)
      .set({
        ...(input.activityTypeId !== undefined && {
          activityTypeId: input.activityTypeId,
        }),
        ...(input.plannedDate !== undefined && {
          plannedDate: input.plannedDate,
        }),
        ...(input.parcelId !== undefined && {
          parcelId: input.parcelId ?? null,
          farmId: farmId ?? null,
        }),
        ...(input.cropCycleId !== undefined && {
          cropCycleId: input.cropCycleId ?? null,
        }),
        ...(input.description !== undefined && {
          description: input.description ?? null,
        }),
        ...(input.estimatedCost !== undefined && {
          estimatedCost: input.estimatedCost,
        }),
      })
      .where(
        and(
          eq(plannedActivities.id, id),
          eq(plannedActivities.orgId, ctx.org.id),
        ),
      )
      .returning();
    return updated;
  });
}

export async function cancelPlannedActivity(ctx: OrgContext, id: string) {
  assertCan(ctx, "planning", "manage");
  await assertOrgFeature(ctx.org.id, "planning");

  return withOrgRls(ctx.org.id, async (tx) => {
    const [current] = await tx
      .select({ status: plannedActivities.status })
      .from(plannedActivities)
      .where(
        and(
          eq(plannedActivities.id, id),
          eq(plannedActivities.orgId, ctx.org.id),
        ),
      )
      .limit(1);
    if (!current) throw new Error("planned activity not found");
    if (current.status !== "planned") {
      throw new Error(`cannot cancel a ${current.status} planned activity`);
    }

    const [updated] = await tx
      .update(plannedActivities)
      .set({ status: "cancelled" })
      .where(
        and(
          eq(plannedActivities.id, id),
          eq(plannedActivities.orgId, ctx.org.id),
        ),
      )
      .returning();
    return updated;
  });
}

/**
 * Converts a planned item into a real activity via activities.ts, then links
 * the planned row. The activity carries zero cost lines — the user logs the
 * real inputs/labor/other cost later, directly on the created activity.
 * Runs createActivityInTx inside THIS function's own transaction (rather
 * than calling the public createActivity, which would open a second, nested
 * transaction) so the conversion and the status-link update are atomic.
 */
export async function convertPlannedActivity(ctx: OrgContext, id: string) {
  assertCan(ctx, "planning", "manage");
  await assertOrgFeature(ctx.org.id, "planning");

  return withOrgRls(ctx.org.id, async (tx) => {
    const [plan] = await tx
      .select()
      .from(plannedActivities)
      .where(
        and(
          eq(plannedActivities.id, id),
          eq(plannedActivities.orgId, ctx.org.id),
        ),
      )
      .limit(1);
    if (!plan) throw new Error("planned activity not found");
    // Idempotence guard: converting twice must not create a second activity.
    if (plan.status !== "planned") {
      throw new Error(`cannot convert a ${plan.status} planned activity`);
    }

    // The activity reuses the plan's own UUID: createActivityInTx is
    // idempotent by id (ON CONFLICT DO NOTHING + replay fetch), so if the
    // status update below fails and the user retries, the same activity row
    // is returned instead of a duplicate being created.
    const { activity } = await createActivityInTx(tx, ctx, {
      id: plan.id,
      activityTypeId: plan.activityTypeId,
      parcelId: plan.parcelId,
      cropCycleId: plan.cropCycleId,
      date: plan.plannedDate,
      description: plan.description,
      otherCost: "0",
      inputs: [],
      labor: [],
    });
    const [updated] = await tx
      .update(plannedActivities)
      .set({ status: "converted", convertedActivityId: activity.id })
      .where(
        and(
          eq(plannedActivities.id, id),
          eq(plannedActivities.orgId, ctx.org.id),
        ),
      )
      .returning();

    return { plan: updated, activity };
  });
}
