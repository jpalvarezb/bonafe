import { and, desc, eq, sql, sum } from "drizzle-orm";
import Decimal from "decimal.js";
import { withOrgRls, type Tx } from "@/lib/db/rls";
import {
  activities,
  budgetLines,
  budgets,
  cropCycles,
  farms,
} from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { assertOrgFeature } from "@/lib/plan-limits";
import { newId } from "@/lib/ids";
import type { BudgetCategory, MonthCategoryAmount } from "@/lib/calc/variance";

export type BudgetInput = {
  name: string;
  year: number;
  farmId?: string | null;
  cropCycleId?: string | null;
  notes?: string | null;
};

// ---------------------------------------------------------------------------
// Budgets
// ---------------------------------------------------------------------------

export async function listBudgets(ctx: OrgContext) {
  return withOrgRls(ctx.org.id, (tx) =>
    tx
      .select({
        budget: budgets,
        farmName: farms.name,
        cycleName: cropCycles.name,
      })
      .from(budgets)
      .leftJoin(farms, eq(budgets.farmId, farms.id))
      .leftJoin(cropCycles, eq(budgets.cropCycleId, cropCycles.id))
      .where(eq(budgets.orgId, ctx.org.id))
      .orderBy(desc(budgets.year), desc(budgets.createdAt)),
  );
}

/** Org-scoped lookup; returns null (not a throw) so pages can 404. */
export async function getBudget(ctx: OrgContext, budgetId: string) {
  return withOrgRls(ctx.org.id, async (tx) => {
    const [row] = await tx
      .select({
        budget: budgets,
        farmName: farms.name,
        cycleName: cropCycles.name,
      })
      .from(budgets)
      .leftJoin(farms, eq(budgets.farmId, farms.id))
      .leftJoin(cropCycles, eq(budgets.cropCycleId, cropCycles.id))
      .where(and(eq(budgets.id, budgetId), eq(budgets.orgId, ctx.org.id)))
      .limit(1);
    return row ?? null;
  });
}

async function requireBudgetInOrg(tx: Tx, ctx: OrgContext, budgetId: string) {
  const [budget] = await tx
    .select()
    .from(budgets)
    .where(and(eq(budgets.id, budgetId), eq(budgets.orgId, ctx.org.id)))
    .limit(1);
  if (!budget) throw new Error("budget not found");
  return budget;
}

export async function createBudget(ctx: OrgContext, input: BudgetInput) {
  assertCan(ctx, "budget", "manage");
  await assertOrgFeature(ctx.org.id, "budgets");

  return withOrgRls(ctx.org.id, async (tx) => {
    if (input.farmId) {
      const [farm] = await tx
        .select({ id: farms.id })
        .from(farms)
        .where(and(eq(farms.id, input.farmId), eq(farms.orgId, ctx.org.id)))
        .limit(1);
      if (!farm) throw new Error("farm not found");
    }

    if (input.cropCycleId) {
      const [cycle] = await tx
        .select({ id: cropCycles.id })
        .from(cropCycles)
        .where(
          and(
            eq(cropCycles.id, input.cropCycleId),
            eq(cropCycles.orgId, ctx.org.id),
          ),
        )
        .limit(1);
      if (!cycle) throw new Error("crop cycle not found");
    }

    const [created] = await tx
      .insert(budgets)
      .values({
        id: newId(),
        orgId: ctx.org.id,
        name: input.name,
        year: input.year,
        farmId: input.farmId ?? null,
        cropCycleId: input.cropCycleId ?? null,
        currencyCode: ctx.org.baseCurrencyCode,
        notes: input.notes ?? null,
        createdBy: ctx.user.id,
      })
      .returning();
    return created;
  });
}

export async function deleteBudget(ctx: OrgContext, budgetId: string) {
  assertCan(ctx, "budget", "manage");
  await assertOrgFeature(ctx.org.id, "budgets");
  return withOrgRls(ctx.org.id, async (tx) => {
    await requireBudgetInOrg(tx, ctx, budgetId);
    // budget_lines cascade on delete (FK onDelete: "cascade").
    await tx
      .delete(budgets)
      .where(and(eq(budgets.id, budgetId), eq(budgets.orgId, ctx.org.id)));
  });
}

// ---------------------------------------------------------------------------
// Budget lines (the month × category grid)
// ---------------------------------------------------------------------------

export async function listBudgetLines(ctx: OrgContext, budgetId: string) {
  return withOrgRls(ctx.org.id, (tx) =>
    tx
      .select()
      .from(budgetLines)
      .where(
        and(eq(budgetLines.budgetId, budgetId), eq(budgetLines.orgId, ctx.org.id)),
      ),
  );
}

/**
 * Upserts one cell of the month × category grid. Amount "0" effectively
 * clears the cell (the row is kept at zero rather than deleted).
 */
export async function upsertBudgetLine(
  ctx: OrgContext,
  budgetId: string,
  month: number,
  category: BudgetCategory,
  amount: string,
) {
  assertCan(ctx, "budget", "manage");
  await assertOrgFeature(ctx.org.id, "budgets");
  return withOrgRls(ctx.org.id, async (tx) => {
    await requireBudgetInOrg(tx, ctx, budgetId);

    const [row] = await tx
      .insert(budgetLines)
      .values({
        id: newId(),
        orgId: ctx.org.id,
        budgetId,
        month,
        category,
        amount,
      })
      .onConflictDoUpdate({
        target: [budgetLines.budgetId, budgetLines.month, budgetLines.category],
        set: {
          amount,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  });
}

// ---------------------------------------------------------------------------
// Actuals + variance
// ---------------------------------------------------------------------------

// Mirrors the org-base-currency convention in src/server/reports/costs.ts and
// src/server/services/payroll.ts: multiply each cost component by the
// activity's own exchange-rate snapshot before summing.
const laborInBase = sql`(${activities.laborCost} * ${activities.exchangeRate})`;
const inputInBase = sql`(${activities.inputCost} * ${activities.exchangeRate})`;
const machineInBase = sql`(${activities.machineCost} * ${activities.exchangeRate})`;
const otherInBase = sql`(${activities.otherCost} * ${activities.exchangeRate})`;

/**
 * Actual spend per month × category for a budget's scope: the budget's
 * year, optionally narrowed to its farm and/or crop cycle, always
 * org-scoped. One row per month with a sum per cost category; unpivoted
 * into the flat MonthCategoryAmount[] shape buildVarianceReport expects.
 */
export async function budgetActuals(
  ctx: OrgContext,
  budget: typeof budgets.$inferSelect,
): Promise<MonthCategoryAmount[]> {
  const monthExpr = sql<number>`extract(month from ${activities.date}::date)::int`;

  return withOrgRls(ctx.org.id, async (tx) => {
    const rows = await tx
      .select({
        month: monthExpr,
        labor: sum(laborInBase),
        input: sum(inputInBase),
        machine: sum(machineInBase),
        other: sum(otherInBase),
      })
      .from(activities)
      .where(
        and(
          eq(activities.orgId, ctx.org.id),
          sql`extract(year from ${activities.date}::date) = ${budget.year}`,
          budget.farmId ? eq(activities.farmId, budget.farmId) : undefined,
          budget.cropCycleId
            ? eq(activities.cropCycleId, budget.cropCycleId)
            : undefined,
        ),
      )
      .groupBy(monthExpr)
      .orderBy(monthExpr);

    const actuals: MonthCategoryAmount[] = [];
    for (const row of rows) {
      actuals.push({ month: row.month, category: "labor", amount: row.labor ?? "0" });
      actuals.push({ month: row.month, category: "input", amount: row.input ?? "0" });
      actuals.push({
        month: row.month,
        category: "machine",
        amount: row.machine ?? "0",
      });
      actuals.push({ month: row.month, category: "other", amount: row.other ?? "0" });
    }
    return actuals;
  });
}

// ---------------------------------------------------------------------------
// Line-grid totals (row/column/grand) — Decimal, never JS numbers.
// ---------------------------------------------------------------------------

export type BudgetLineTotals = {
  /** Keyed by month number, stringified (index safely with a number key). */
  byMonth: Record<string, string>;
  byCategory: Record<BudgetCategory, string>;
  grand: string;
};

export function summarizeBudgetLines(
  lines: Array<{
    month: number;
    category: BudgetCategory;
    amount: string | number;
  }>,
): BudgetLineTotals {
  const byMonth = new Map<number, Decimal>();
  const byCategory = new Map<BudgetCategory, Decimal>();
  let grand = new Decimal(0);
  for (const line of lines) {
    const amount = new Decimal(line.amount);
    byMonth.set(line.month, (byMonth.get(line.month) ?? new Decimal(0)).add(amount));
    byCategory.set(
      line.category,
      (byCategory.get(line.category) ?? new Decimal(0)).add(amount),
    );
    grand = grand.add(amount);
  }
  return {
    byMonth: Object.fromEntries(
      [...byMonth].map(([month, value]) => [month, value.toFixed(4)]),
    ),
    byCategory: Object.fromEntries(
      [...byCategory].map(([category, value]) => [category, value.toFixed(4)]),
    ) as Record<BudgetCategory, string>,
    grand: grand.toFixed(4),
  };
}
