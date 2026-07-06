import { and, asc, between, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { attendanceRecords, farms, workers } from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { assertOrgFeature } from "@/lib/plan-limits";
import { newId } from "@/lib/ids";

export type AttendanceUpsertInput = {
  /** Client-generated UUIDv7 for offline idempotency; server fills if absent. */
  id?: string;
  workerId: string;
  date: string;
  status: "present" | "half_day" | "absent" | "sick" | "leave";
  hoursWorked?: string | null;
  farmId?: string | null;
  notes?: string | null;
  createdOffline?: boolean;
};

/**
 * One row per (worker, date): concurrent/offline captures collapse via
 * ON CONFLICT ... DO UPDATE (last write wins, per the sync design).
 * Rates are snapshotted server-side from the worker row so a client can
 * never inflate pay, and later rate edits don't rewrite history.
 */
export async function upsertAttendance(
  ctx: OrgContext,
  input: AttendanceUpsertInput,
) {
  assertCan(ctx, "attendance", "create");
  await assertOrgFeature(ctx.org.id, "labor");

  const [worker] = await db
    .select({
      id: workers.id,
      dailyRate: workers.dailyRate,
      hourlyRate: workers.hourlyRate,
    })
    .from(workers)
    .where(and(eq(workers.id, input.workerId), eq(workers.orgId, ctx.org.id)))
    .limit(1);
  if (!worker) throw new Error("worker not found");

  if (input.farmId) {
    const [farm] = await db
      .select({ id: farms.id })
      .from(farms)
      .where(and(eq(farms.id, input.farmId), eq(farms.orgId, ctx.org.id)))
      .limit(1);
    if (!farm) throw new Error("farm not found");
  }

  const [row] = await db
    .insert(attendanceRecords)
    .values({
      id: input.id ?? newId(),
      orgId: ctx.org.id,
      workerId: input.workerId,
      date: input.date,
      status: input.status,
      hoursWorked: input.hoursWorked || null,
      dailyRateSnapshot: worker.dailyRate,
      hourlyRateSnapshot: worker.hourlyRate,
      farmId: input.farmId ?? null,
      notes: input.notes ?? null,
      createdBy: ctx.user.id,
      createdOffline: input.createdOffline ?? false,
    })
    .onConflictDoUpdate({
      target: [
        attendanceRecords.orgId,
        attendanceRecords.workerId,
        attendanceRecords.date,
      ],
      set: {
        status: input.status,
        hoursWorked: input.hoursWorked || null,
        dailyRateSnapshot: worker.dailyRate,
        hourlyRateSnapshot: worker.hourlyRate,
        farmId: input.farmId ?? null,
        notes: input.notes ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();
  return row;
}

/** Grid data for a date range, with worker names, oldest first. */
export async function listAttendanceRange(
  ctx: OrgContext,
  range: { from: string; to: string },
) {
  return db
    .select({
      record: attendanceRecords,
      workerName: workers.name,
    })
    .from(attendanceRecords)
    .innerJoin(workers, eq(attendanceRecords.workerId, workers.id))
    .where(
      and(
        eq(attendanceRecords.orgId, ctx.org.id),
        between(attendanceRecords.date, range.from, range.to),
      ),
    )
    .orderBy(asc(attendanceRecords.date));
}

export async function deleteAttendance(ctx: OrgContext, id: string) {
  assertCan(ctx, "attendance", "delete");
  await assertOrgFeature(ctx.org.id, "labor");
  await db
    .delete(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.id, id),
        eq(attendanceRecords.orgId, ctx.org.id),
      ),
    );
}
