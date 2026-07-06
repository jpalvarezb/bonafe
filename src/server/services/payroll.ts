import { and, between, desc, eq, notInArray, sql, sum } from "drizzle-orm";
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import {
  activities,
  activityLabor,
  activityTypes,
  attendanceRecords,
  parcels,
  payrollEntries,
  payrollPeriods,
  workers,
} from "@/lib/db/schema";
import { listAttendanceRange } from "@/server/services/attendance";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { assertOrgFeature } from "@/lib/plan-limits";
import { newId } from "@/lib/ids";
import {
  computePayrollEntry,
  periodTotal,
  type AttendanceLine,
} from "@/lib/calc/payroll";

export type PayrollPeriodInput = {
  name: string;
  startDate: string;
  endDate: string;
};

export type PayrollEntryAdjustmentInput = {
  bonuses: string;
  deductions: string;
  notes?: string | null;
};

// ---------------------------------------------------------------------------
// Periods
// ---------------------------------------------------------------------------

export async function listPayrollPeriods(ctx: OrgContext) {
  return db
    .select()
    .from(payrollPeriods)
    .where(eq(payrollPeriods.orgId, ctx.org.id))
    .orderBy(desc(payrollPeriods.startDate));
}

/** Org-scoped lookup; returns null (not a throw) so pages can 404. */
export async function getPayrollPeriod(ctx: OrgContext, periodId: string) {
  const [period] = await db
    .select()
    .from(payrollPeriods)
    .where(
      and(eq(payrollPeriods.id, periodId), eq(payrollPeriods.orgId, ctx.org.id)),
    )
    .limit(1);
  return period ?? null;
}

async function requirePeriodInOrg(ctx: OrgContext, periodId: string) {
  const period = await getPayrollPeriod(ctx, periodId);
  if (!period) throw new Error("payroll period not found");
  return period;
}

export async function createPayrollPeriod(
  ctx: OrgContext,
  input: PayrollPeriodInput,
) {
  assertCan(ctx, "payroll", "manage");
  await assertOrgFeature(ctx.org.id, "payroll");
  const [created] = await db
    .insert(payrollPeriods)
    .values({
      id: newId(),
      orgId: ctx.org.id,
      name: input.name,
      startDate: input.startDate,
      endDate: input.endDate,
      status: "open",
      currencyCode: ctx.org.baseCurrencyCode,
      createdBy: ctx.user.id,
    })
    .returning();
  return created;
}

// ---------------------------------------------------------------------------
// Entries (the payroll book)
// ---------------------------------------------------------------------------

export async function listPayrollEntries(ctx: OrgContext, periodId: string) {
  return db
    .select({ entry: payrollEntries, workerName: workers.name })
    .from(payrollEntries)
    .innerJoin(workers, eq(payrollEntries.workerId, workers.id))
    .where(
      and(
        eq(payrollEntries.periodId, periodId),
        eq(payrollEntries.orgId, ctx.org.id),
      ),
    )
    .orderBy(workers.name);
}

/**
 * (Re)generates entries for a period from attendance in [startDate, endDate].
 * Preserves each worker's manually-entered bonuses/deductions/notes across
 * regeneration; only the attendance-derived fields (days/hours/base/overtime)
 * and the recomputed net are refreshed. Workers with no attendance left in
 * range have their entry removed.
 */
export async function generatePayrollEntries(
  ctx: OrgContext,
  periodId: string,
) {
  assertCan(ctx, "payroll", "manage");
  await assertOrgFeature(ctx.org.id, "payroll");
  const period = await requirePeriodInOrg(ctx, periodId);
  if (period.status !== "open") {
    throw new Error("cannot regenerate a closed payroll period");
  }

  const attendanceRows = await listAttendanceRange(ctx, {
    from: period.startDate,
    to: period.endDate,
  });

  const byWorker = new Map<string, AttendanceLine[]>();
  for (const row of attendanceRows) {
    const line: AttendanceLine = {
      status: row.record.status as AttendanceLine["status"],
      hoursWorked: row.record.hoursWorked,
      dailyRateSnapshot: row.record.dailyRateSnapshot,
      hourlyRateSnapshot: row.record.hourlyRateSnapshot,
    };
    const existing = byWorker.get(row.record.workerId);
    if (existing) existing.push(line);
    else byWorker.set(row.record.workerId, [line]);
  }
  const workerIds = [...byWorker.keys()];

  const existingEntries = await db
    .select()
    .from(payrollEntries)
    .where(
      and(
        eq(payrollEntries.periodId, periodId),
        eq(payrollEntries.orgId, ctx.org.id),
      ),
    );
  const existingByWorker = new Map(
    existingEntries.map((entry) => [entry.workerId, entry]),
  );

  await db.transaction(async (tx) => {
    // Drop entries for workers who no longer have attendance in range.
    if (workerIds.length > 0) {
      await tx
        .delete(payrollEntries)
        .where(
          and(
            eq(payrollEntries.periodId, periodId),
            eq(payrollEntries.orgId, ctx.org.id),
            notInArray(payrollEntries.workerId, workerIds),
          ),
        );
    } else {
      await tx
        .delete(payrollEntries)
        .where(
          and(
            eq(payrollEntries.periodId, periodId),
            eq(payrollEntries.orgId, ctx.org.id),
          ),
        );
    }

    for (const workerId of workerIds) {
      const preserved = existingByWorker.get(workerId);
      const totals = computePayrollEntry({
        attendance: byWorker.get(workerId)!,
        pieceworkAmount: preserved?.pieceworkAmount ?? "0",
        bonuses: preserved?.bonuses ?? "0",
        deductions: preserved?.deductions ?? "0",
      });

      const values = {
        daysWorked: totals.daysWorked,
        hoursWorked: totals.hoursWorked,
        baseAmount: totals.baseAmount,
        overtimeAmount: totals.overtimeAmount,
        pieceworkAmount: totals.pieceworkAmount,
        bonuses: totals.bonuses,
        deductions: totals.deductions,
        netAmount: totals.netAmount,
        notes: preserved?.notes ?? null,
      };

      if (preserved) {
        await tx
          .update(payrollEntries)
          .set(values)
          .where(
            and(
              eq(payrollEntries.id, preserved.id),
              eq(payrollEntries.orgId, ctx.org.id),
            ),
          );
      } else {
        await tx.insert(payrollEntries).values({
          id: newId(),
          orgId: ctx.org.id,
          periodId,
          workerId,
          ...values,
        });
      }
    }
  });

  return listPayrollEntries(ctx, periodId);
}

/**
 * Updates a single entry's manual bonuses/deductions/notes. The net amount
 * is never taken from the client: it is recomputed here from the worker's
 * stored attendance rows for the period plus the submitted adjustment.
 */
export async function updatePayrollEntryAdjustments(
  ctx: OrgContext,
  periodId: string,
  entryId: string,
  input: PayrollEntryAdjustmentInput,
) {
  assertCan(ctx, "payroll", "manage");
  await assertOrgFeature(ctx.org.id, "payroll");
  const period = await requirePeriodInOrg(ctx, periodId);
  if (period.status !== "open") {
    throw new Error("cannot edit entries on a closed payroll period");
  }

  const [entry] = await db
    .select()
    .from(payrollEntries)
    .where(
      and(
        eq(payrollEntries.id, entryId),
        eq(payrollEntries.periodId, periodId),
        eq(payrollEntries.orgId, ctx.org.id),
      ),
    )
    .limit(1);
  if (!entry) throw new Error("payroll entry not found");

  const attendanceRows = await db
    .select({
      status: attendanceRecords.status,
      hoursWorked: attendanceRecords.hoursWorked,
      dailyRateSnapshot: attendanceRecords.dailyRateSnapshot,
      hourlyRateSnapshot: attendanceRecords.hourlyRateSnapshot,
    })
    .from(attendanceRecords)
    .where(
      and(
        eq(attendanceRecords.orgId, ctx.org.id),
        eq(attendanceRecords.workerId, entry.workerId),
        between(attendanceRecords.date, period.startDate, period.endDate),
      ),
    );

  const totals = computePayrollEntry({
    attendance: attendanceRows.map((row) => ({
      status: row.status as AttendanceLine["status"],
      hoursWorked: row.hoursWorked,
      dailyRateSnapshot: row.dailyRateSnapshot,
      hourlyRateSnapshot: row.hourlyRateSnapshot,
    })),
    pieceworkAmount: entry.pieceworkAmount,
    bonuses: input.bonuses,
    deductions: input.deductions,
  });

  const [updated] = await db
    .update(payrollEntries)
    .set({
      daysWorked: totals.daysWorked,
      hoursWorked: totals.hoursWorked,
      baseAmount: totals.baseAmount,
      overtimeAmount: totals.overtimeAmount,
      pieceworkAmount: totals.pieceworkAmount,
      bonuses: totals.bonuses,
      deductions: totals.deductions,
      netAmount: totals.netAmount,
      notes: input.notes ?? null,
    })
    .where(
      and(
        eq(payrollEntries.id, entryId),
        eq(payrollEntries.orgId, ctx.org.id),
      ),
    )
    .returning();
  return updated;
}

export async function closePayrollPeriod(ctx: OrgContext, periodId: string) {
  assertCan(ctx, "payroll", "manage");
  await assertOrgFeature(ctx.org.id, "payroll");
  const period = await requirePeriodInOrg(ctx, periodId);
  if (period.status !== "open") {
    throw new Error("payroll period is already closed");
  }

  const entries = await db
    .select({ netAmount: payrollEntries.netAmount })
    .from(payrollEntries)
    .where(
      and(
        eq(payrollEntries.periodId, periodId),
        eq(payrollEntries.orgId, ctx.org.id),
      ),
    );
  if (entries.length === 0) {
    throw new Error("cannot close a payroll period with no entries");
  }

  const total = periodTotal(entries);
  const [updated] = await db
    .update(payrollPeriods)
    .set({ status: "closed", closedAt: new Date(), totalAmount: total })
    .where(
      and(eq(payrollPeriods.id, periodId), eq(payrollPeriods.orgId, ctx.org.id)),
    )
    .returning();
  return updated;
}

// ---------------------------------------------------------------------------
// Labor efficiency report (read-only, org-scoped, date-ranged)
// ---------------------------------------------------------------------------

export type DateRange = { from: string; to: string };

/** Per worker: days worked and gross pay (base + overtime) in a date range. */
export async function laborByWorkerReport(ctx: OrgContext, range: DateRange) {
  const rows = await listAttendanceRange(ctx, range);
  const byWorker = new Map<
    string,
    { workerName: string; attendance: AttendanceLine[] }
  >();
  for (const row of rows) {
    const line: AttendanceLine = {
      status: row.record.status as AttendanceLine["status"],
      hoursWorked: row.record.hoursWorked,
      dailyRateSnapshot: row.record.dailyRateSnapshot,
      hourlyRateSnapshot: row.record.hourlyRateSnapshot,
    };
    const existing = byWorker.get(row.record.workerId);
    if (existing) existing.attendance.push(line);
    else
      byWorker.set(row.record.workerId, {
        workerName: row.workerName,
        attendance: [line],
      });
  }

  return [...byWorker.entries()]
    .map(([workerId, { workerName, attendance }]) => {
      const totals = computePayrollEntry({ attendance });
      const grossPay = new Decimal(totals.baseAmount)
        .add(totals.overtimeAmount)
        .toFixed(4);
      return {
        workerId,
        workerName,
        daysWorked: totals.daysWorked,
        hoursWorked: totals.hoursWorked,
        grossPay,
      };
    })
    .sort((a, b) => a.workerName.localeCompare(b.workerName));
}

// activity_labor.amount is denominated in its parent activity's own
// currency; multiply by the activity's exchange-rate snapshot (same
// convention as src/server/reports/costs.ts) to express sums in the org's
// base currency.
const laborAmountInBase = sql`(${activityLabor.amount} * ${activities.exchangeRate})`;

/** Labor cost by activity type name, in the org base currency, date-ranged. */
export async function laborCostByActivityType(
  ctx: OrgContext,
  range: DateRange,
) {
  return db
    .select({
      typeName: activityTypes.name,
      totalAmount: sum(laborAmountInBase),
    })
    .from(activityLabor)
    .innerJoin(activities, eq(activityLabor.activityId, activities.id))
    .innerJoin(activityTypes, eq(activities.activityTypeId, activityTypes.id))
    .where(
      and(
        eq(activities.orgId, ctx.org.id),
        between(activities.date, range.from, range.to),
      ),
    )
    .groupBy(activityTypes.name)
    .orderBy(desc(sum(laborAmountInBase)));
}

/** Labor cost by parcel name; activities with no parcel roll into "general". */
export async function laborCostByParcel(ctx: OrgContext, range: DateRange) {
  return db
    .select({
      parcelId: parcels.id,
      parcelName: parcels.name,
      totalAmount: sum(laborAmountInBase),
    })
    .from(activityLabor)
    .innerJoin(activities, eq(activityLabor.activityId, activities.id))
    .leftJoin(parcels, eq(activities.parcelId, parcels.id))
    .where(
      and(
        eq(activities.orgId, ctx.org.id),
        between(activities.date, range.from, range.to),
      ),
    )
    .groupBy(parcels.id, parcels.name)
    .orderBy(desc(sum(laborAmountInBase)));
}
