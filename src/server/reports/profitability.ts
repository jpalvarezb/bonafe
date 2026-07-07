import { and, eq, inArray, sql, sum } from "drizzle-orm";
import { withOrgRls } from "@/lib/db/rls";
import { activities, cropCycles, pieceworkEntries, processingRuns, sales } from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import {
  computeCycleProfitability,
  type CycleProfitability,
} from "@/lib/calc/profitability";

export type CycleProfitabilityRow = CycleProfitability & {
  cycleId: string;
  cycleName: string;
  areaHa: string | null;
  outputQuantity: string | null;
  outputUnit: string | null;
};

// Every sum below is expressed in the org base currency: sales/activities
// carry their own currencyCode + exchangeRate snapshot (multiply to convert,
// same convention as budgetActuals in server/services/budgets.ts), while
// processing_runs.cost is captured directly in base currency (no fx column
// on that table), so it is summed as-is.
const saleIncomeInBase = sql`(${sales.total} * ${sales.exchangeRate})`;
const activityCostInBase = sql`(${activities.totalCost} * ${activities.exchangeRate})`;

/**
 * Per-cycle profitability for the org's crop cycles (or a single cycle when
 * `cycleId` is given). Piecework is intentionally excluded from per-cycle
 * rows — piecework_entries has no crop_cycle_id column, so attributing it to
 * a cycle would require guessing via the worker/harvest link, which is out
 * of scope for Phase 6. Callers should render `orgPieceworkCost` (see
 * `orgUnattributedPieceworkCost` below) as a separate, clearly-labeled line.
 */
export async function cycleProfitabilityReport(
  ctx: OrgContext,
  cycleId?: string,
): Promise<CycleProfitabilityRow[]> {
  return withOrgRls(ctx.org.id, async (tx) => {
    const cycles = await tx
      .select({
        id: cropCycles.id,
        name: cropCycles.name,
        areaHa: cropCycles.plantedAreaHa,
      })
      .from(cropCycles)
      .where(
        and(
          eq(cropCycles.orgId, ctx.org.id),
          cycleId ? eq(cropCycles.id, cycleId) : undefined,
        ),
      )
      .orderBy(cropCycles.name);

    if (cycles.length === 0) return [];
    const cycleIds = cycles.map((c) => c.id);

    // Sequential on purpose: these three share one transaction client, and
    // pg does not support concurrent queries on a single connection — a
    // Promise.all here "works" (pg queues internally) but emits the
    // "client already executing a query" deprecation warning and breaks
    // outright at pg@9.
    const salesRows = await tx
      .select({
        cropCycleId: sales.cropCycleId,
        income: sum(saleIncomeInBase),
      })
      .from(sales)
      .where(
        and(eq(sales.orgId, ctx.org.id), inArray(sales.cropCycleId, cycleIds)),
      )
      .groupBy(sales.cropCycleId);
    const activityRows = await tx
      .select({
        cropCycleId: activities.cropCycleId,
        cost: sum(activityCostInBase),
      })
      .from(activities)
      .where(
        and(
          eq(activities.orgId, ctx.org.id),
          inArray(activities.cropCycleId, cycleIds),
        ),
      )
      .groupBy(activities.cropCycleId);
    const processingRows = await tx
      .select({
          cropCycleId: processingRuns.cropCycleId,
          cost: sum(processingRuns.cost),
          outputQuantity: sum(processingRuns.outputQuantity),
          // Distinct-unit count per cycle: > 1 means mixed units, so the
          // aggregated outputQuantity can't be labeled with a single unit.
          unitCount: sql<number>`count(distinct ${processingRuns.outputUnit})`,
          outputUnit: sql<string | null>`min(${processingRuns.outputUnit})`,
        })
      .from(processingRuns)
      .where(
        and(
          eq(processingRuns.orgId, ctx.org.id),
          inArray(processingRuns.cropCycleId, cycleIds),
        ),
      )
      .groupBy(processingRuns.cropCycleId);

    const salesByCycle = new Map(
      salesRows.map((r) => [r.cropCycleId, r.income ?? "0"]),
    );
    const activityByCycle = new Map(
      activityRows.map((r) => [r.cropCycleId, r.cost ?? "0"]),
    );
    const processingByCycle = new Map(
      processingRows.map((r) => [
        r.cropCycleId,
        {
          cost: r.cost ?? "0",
          outputQuantity: Number(r.unitCount) === 1 ? r.outputQuantity : null,
          outputUnit: Number(r.unitCount) === 1 ? r.outputUnit : null,
        },
      ]),
    );

    return cycles.map((cycle) => {
      const income = salesByCycle.get(cycle.id) ?? "0";
      const activityCost = activityByCycle.get(cycle.id) ?? "0";
      const processing = processingByCycle.get(cycle.id) ?? {
        cost: "0",
        outputQuantity: null as string | null,
        outputUnit: null as string | null,
      };

      const profitability = computeCycleProfitability({
        salesIncome: [income],
        activityCosts: [activityCost],
        processingCosts: [processing.cost],
        pieceworkCosts: [],
        areaHa: cycle.areaHa,
        outputQuantity: processing.outputQuantity,
      });

      return {
        ...profitability,
        cycleId: cycle.id,
        cycleName: cycle.name,
        areaHa: cycle.areaHa,
        outputQuantity: processing.outputQuantity,
        outputUnit: processing.outputUnit,
      };
    });
  });
}

/**
 * Org-wide piecework spend, shown as a separate footnote line on the
 * profitability report since it cannot be attributed to a crop cycle
 * (piecework_entries has no crop_cycle_id — see module doc above).
 */
export async function orgUnattributedPieceworkCost(
  ctx: OrgContext,
): Promise<string> {
  const [row] = await withOrgRls(ctx.org.id, (tx) =>
    tx
      .select({ total: sum(pieceworkEntries.amount) })
      .from(pieceworkEntries)
      .where(eq(pieceworkEntries.orgId, ctx.org.id)),
  );
  return row?.total ?? "0";
}
