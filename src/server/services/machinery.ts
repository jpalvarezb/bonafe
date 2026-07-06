import { and, asc, desc, eq } from "drizzle-orm";
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import {
  activities,
  machines,
  machineUsageLogs,
  workers,
  workOrders,
} from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { assertOrgFeature } from "@/lib/plan-limits";
import { newId } from "@/lib/ids";

export type MachineInput = {
  name: string;
  code?: string | null;
  category?: string | null;
  brand?: string | null;
  model?: string | null;
  year?: number | null;
  hourlyCost?: string;
  notes?: string | null;
};

/** Full machine roster. Pass includeInactive to also show deactivated machines. */
export async function listMachines(
  ctx: OrgContext,
  filter?: { includeInactive?: boolean },
) {
  return db
    .select()
    .from(machines)
    .where(
      and(
        eq(machines.orgId, ctx.org.id),
        filter?.includeInactive ? undefined : eq(machines.active, true),
      ),
    )
    .orderBy(asc(machines.name));
}

/** Active-only roster, for work-order and usage-log machine selects. */
export async function listActiveMachines(ctx: OrgContext) {
  return listMachines(ctx, { includeInactive: false });
}

export async function getMachine(ctx: OrgContext, machineId: string) {
  const [machine] = await db
    .select()
    .from(machines)
    .where(and(eq(machines.id, machineId), eq(machines.orgId, ctx.org.id)))
    .limit(1);
  return machine ?? null;
}

export async function createMachine(ctx: OrgContext, input: MachineInput) {
  assertCan(ctx, "machine", "manage");
  await assertOrgFeature(ctx.org.id, "machinery");
  const [created] = await db
    .insert(machines)
    .values({
      id: newId(),
      orgId: ctx.org.id,
      name: input.name,
      code: input.code ?? null,
      category: input.category ?? null,
      brand: input.brand ?? null,
      model: input.model ?? null,
      year: input.year ?? null,
      hourlyCost: input.hourlyCost ?? "0",
      notes: input.notes ?? null,
    })
    .returning();
  return created;
}

export async function updateMachine(
  ctx: OrgContext,
  machineId: string,
  input: Partial<MachineInput>,
) {
  assertCan(ctx, "machine", "manage");
  await assertOrgFeature(ctx.org.id, "machinery");
  const [updated] = await db
    .update(machines)
    .set(input)
    .where(and(eq(machines.id, machineId), eq(machines.orgId, ctx.org.id)))
    .returning();
  return updated;
}

/** Soft toggle of active/inactive; machines are never hard-deleted. */
export async function setMachineActive(
  ctx: OrgContext,
  machineId: string,
  active: boolean,
) {
  assertCan(ctx, "machine", "manage");
  await assertOrgFeature(ctx.org.id, "machinery");
  const [updated] = await db
    .update(machines)
    .set({ active })
    .where(and(eq(machines.id, machineId), eq(machines.orgId, ctx.org.id)))
    .returning();
  return updated;
}

export type UsageLogInput = {
  machineId: string;
  date: string;
  hoursUsed: string;
  fuelLiters?: string | null;
  fuelCost?: string;
  activityId?: string | null;
  workOrderId?: string | null;
  operatorWorkerId?: string | null;
  notes?: string | null;
};

/** Recomputes activities.totalCost from its four stored cost components. */
function recomputeActivityTotal(activity: {
  laborCost: string;
  inputCost: string;
  machineCost: string;
  otherCost: string;
}): string {
  return new Decimal(activity.laborCost)
    .add(activity.inputCost)
    .add(activity.machineCost)
    .add(activity.otherCost)
    .toFixed(4);
}

export async function createUsageLog(ctx: OrgContext, input: UsageLogInput) {
  assertCan(ctx, "machine", "log");
  await assertOrgFeature(ctx.org.id, "machinery");

  const [machine] = await db
    .select({ id: machines.id, hourlyCost: machines.hourlyCost })
    .from(machines)
    .where(
      and(eq(machines.id, input.machineId), eq(machines.orgId, ctx.org.id)),
    )
    .limit(1);
  if (!machine) throw new Error("machine not found");

  if (input.activityId) {
    const [row] = await db
      .select({ id: activities.id })
      .from(activities)
      .where(
        and(
          eq(activities.id, input.activityId),
          eq(activities.orgId, ctx.org.id),
        ),
      )
      .limit(1);
    if (!row) throw new Error("activity not found");
  }

  if (input.workOrderId) {
    const [row] = await db
      .select({ id: workOrders.id })
      .from(workOrders)
      .where(
        and(
          eq(workOrders.id, input.workOrderId),
          eq(workOrders.orgId, ctx.org.id),
        ),
      )
      .limit(1);
    if (!row) throw new Error("work order not found");
  }

  if (input.operatorWorkerId) {
    const [row] = await db
      .select({ id: workers.id })
      .from(workers)
      .where(
        and(
          eq(workers.id, input.operatorWorkerId),
          eq(workers.orgId, ctx.org.id),
        ),
      )
      .limit(1);
    if (!row) throw new Error("operator worker not found");
  }

  // Snapshot the machine's current rate so later hourly-cost edits don't
  // rewrite historical usage-log totals.
  const hourlyCostSnapshot = machine.hourlyCost;
  const fuelCost = input.fuelCost ?? "0";
  const totalCost = new Decimal(input.hoursUsed)
    .mul(hourlyCostSnapshot)
    .add(fuelCost)
    .toFixed(4);

  return db.transaction(async (tx) => {
    const [created] = await tx
      .insert(machineUsageLogs)
      .values({
        id: newId(),
        orgId: ctx.org.id,
        machineId: input.machineId,
        activityId: input.activityId ?? null,
        workOrderId: input.workOrderId ?? null,
        operatorWorkerId: input.operatorWorkerId ?? null,
        date: input.date,
        hoursUsed: input.hoursUsed,
        fuelLiters: input.fuelLiters ?? null,
        fuelCost,
        hourlyCostSnapshot,
        totalCost,
        notes: input.notes ?? null,
        createdBy: ctx.user.id,
      })
      .returning();

    if (input.activityId) {
      // Locked read: concurrent logs on the same activity serialize here, so
      // the add below can't lose an update under READ COMMITTED.
      const [activity] = await tx
        .select({
          id: activities.id,
          laborCost: activities.laborCost,
          inputCost: activities.inputCost,
          machineCost: activities.machineCost,
          otherCost: activities.otherCost,
        })
        .from(activities)
        .where(
          and(
            eq(activities.id, input.activityId),
            eq(activities.orgId, ctx.org.id),
          ),
        )
        .limit(1)
        .for("update");
      if (!activity) throw new Error("activity not found");

      const machineCost = new Decimal(activity.machineCost)
        .add(totalCost)
        .toFixed(4);
      const totalActivityCost = recomputeActivityTotal({
        laborCost: activity.laborCost,
        inputCost: activity.inputCost,
        machineCost,
        otherCost: activity.otherCost,
      });

      await tx
        .update(activities)
        .set({ machineCost, totalCost: totalActivityCost })
        .where(
          and(
            eq(activities.id, input.activityId),
            eq(activities.orgId, ctx.org.id),
          ),
        );
    }

    return created;
  });
}

export async function deleteUsageLog(ctx: OrgContext, logId: string) {
  assertCan(ctx, "machine", "log");
  await assertOrgFeature(ctx.org.id, "machinery");

  return db.transaction(async (tx) => {
    // Locked: a concurrent delete of the same log blocks here and then sees
    // the row gone, so the activity cost can't be subtracted twice.
    const [log] = await tx
      .select()
      .from(machineUsageLogs)
      .where(
        and(
          eq(machineUsageLogs.id, logId),
          eq(machineUsageLogs.orgId, ctx.org.id),
        ),
      )
      .limit(1)
      .for("update");
    if (!log) throw new Error("usage log not found");

    if (log.activityId) {
      const [activity] = await tx
        .select({
          id: activities.id,
          laborCost: activities.laborCost,
          inputCost: activities.inputCost,
          machineCost: activities.machineCost,
          otherCost: activities.otherCost,
        })
        .from(activities)
        .where(
          and(
            eq(activities.id, log.activityId),
            eq(activities.orgId, ctx.org.id),
          ),
        )
        .limit(1)
        .for("update");

      // Activity may already be gone (FK sets activityId to NULL on delete);
      // only adjust when it's still there.
      if (activity) {
        const machineCost = Decimal.max(
          new Decimal(activity.machineCost).sub(log.totalCost),
          0,
        ).toFixed(4);
        const totalActivityCost = recomputeActivityTotal({
          laborCost: activity.laborCost,
          inputCost: activity.inputCost,
          machineCost,
          otherCost: activity.otherCost,
        });

        await tx
          .update(activities)
          .set({ machineCost, totalCost: totalActivityCost })
          .where(
            and(
              eq(activities.id, log.activityId),
              eq(activities.orgId, ctx.org.id),
            ),
          );
      }
    }

    await tx
      .delete(machineUsageLogs)
      .where(
        and(
          eq(machineUsageLogs.id, logId),
          eq(machineUsageLogs.orgId, ctx.org.id),
        ),
      );
  });
}

/** Usage-log history, optionally scoped to one machine; newest first. */
export async function listUsageLogs(
  ctx: OrgContext,
  filter?: { machineId?: string },
) {
  return db
    .select({
      log: machineUsageLogs,
      machineName: machines.name,
      operatorName: workers.name,
      activityDate: activities.date,
      activityDescription: activities.description,
      workOrderCode: workOrders.code,
    })
    .from(machineUsageLogs)
    .innerJoin(machines, eq(machineUsageLogs.machineId, machines.id))
    .leftJoin(workers, eq(machineUsageLogs.operatorWorkerId, workers.id))
    .leftJoin(activities, eq(machineUsageLogs.activityId, activities.id))
    .leftJoin(workOrders, eq(machineUsageLogs.workOrderId, workOrders.id))
    .where(
      and(
        eq(machineUsageLogs.orgId, ctx.org.id),
        filter?.machineId
          ? eq(machineUsageLogs.machineId, filter.machineId)
          : undefined,
      ),
    )
    .orderBy(desc(machineUsageLogs.date), desc(machineUsageLogs.createdAt))
    .limit(200);
}
