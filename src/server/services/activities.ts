import { and, asc, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { withOrgRls, type Tx } from "@/lib/db/rls";
import {
  activities,
  activityInputs,
  activityLabor,
  activityTypes,
  costCenters,
  cropCycles,
  farms,
  inventoryMovements,
  parcels,
  products,
  workers,
} from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { newId } from "@/lib/ids";
import {
  computeActivityTotals,
  type InputLine,
  type LaborLine,
} from "@/lib/calc/costs";
import { computeStock } from "@/lib/calc/inventory";
import { defaultUnitCostByProduct } from "@/lib/calc/activity-costing";
import { latestRateToBaseInTx } from "@/server/services/exchange-rates";
import { ensureDefaultWarehouseInTx } from "@/server/services/inventory";

export type ActivityInput = {
  /** Client-generated UUIDv7 for offline idempotency; server fills if absent. */
  id?: string;
  parcelId?: string | null;
  cropCycleId?: string | null;
  costCenterId?: string | null;
  activityTypeId: string;
  date: string;
  description?: string | null;
  machineCost?: string;
  otherCost?: string;
  currencyCode?: string;
  createdOffline?: boolean;
  /** unitCost is optional: an empty/absent value is derived from the org's
   * default-warehouse WAC (see deriveDefaultUnitCostInTx) instead of
   * requiring re-typed free text. */
  inputs: Array<
    Omit<InputLine, "unitCost"> & {
      productId: string;
      unitCost?: string | number | null;
    }
  >;
  labor: Array<
    LaborLine & { workerName?: string | null; workerId?: string | null }
  >;
};

/**
 * Weighted-average cost of a product in a single warehouse, derived from the
 * same signed movement ledger getStockByProduct folds — queried inside the
 * caller's own tx so it sees uncommitted movements from earlier in the same
 * request. Reuses computeStock (src/lib/calc/inventory.ts) and the
 * default-warehouse-row shape defaultUnitCostByProduct expects.
 */
async function deriveDefaultUnitCostInTx(
  tx: Tx,
  ctx: OrgContext,
  warehouseId: string,
  productId: string,
): Promise<string | undefined> {
  const movementRows = await tx
    .select({
      quantity: inventoryMovements.quantity,
      unitCost: inventoryMovements.unitCost,
    })
    .from(inventoryMovements)
    .where(
      and(
        eq(inventoryMovements.orgId, ctx.org.id),
        eq(inventoryMovements.warehouseId, warehouseId),
        eq(inventoryMovements.productId, productId),
      ),
    )
    .orderBy(asc(inventoryMovements.date), asc(inventoryMovements.createdAt));
  if (movementRows.length === 0) return undefined;

  const stock = computeStock(movementRows);
  return defaultUnitCostByProduct(
    [
      {
        productId,
        warehouseId,
        isDefaultWarehouse: true,
        avgUnitCost: stock.avgUnitCost,
      },
    ],
    productId,
  );
}

/**
 * Exported as an `...InTx` variant too: convertPlannedActivity (planning.ts)
 * creates the real activity from within its own transaction and must reuse
 * that `tx` here rather than opening a second, nested one.
 */
export async function createActivityInTx(
  tx: Tx,
  ctx: OrgContext,
  input: ActivityInput,
) {
  let farmId: string | null = null;
  if (input.parcelId) {
    const [parcel] = await tx
      .select({ farmId: parcels.farmId, active: parcels.active })
      .from(parcels)
      .where(
        and(eq(parcels.id, input.parcelId), eq(parcels.orgId, ctx.org.id)),
      )
      .limit(1);
    if (!parcel) throw new Error("parcel not found");
    if (!parcel.active) throw new Error("parcel is inactive");
    farmId = parcel.farmId;
  }

  // Every client-supplied FK must resolve inside the caller's org (activity
  // types may also be global catalog rows with org_id NULL).
  const [activityType] = await tx
    .select({ id: activityTypes.id })
    .from(activityTypes)
    .where(
      and(
        eq(activityTypes.id, input.activityTypeId),
        or(isNull(activityTypes.orgId), eq(activityTypes.orgId, ctx.org.id)),
      ),
    )
    .limit(1);
  if (!activityType) throw new Error("activity type not found");

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

  if (input.costCenterId) {
    const [costCenter] = await tx
      .select({ id: costCenters.id })
      .from(costCenters)
      .where(
        and(
          eq(costCenters.id, input.costCenterId),
          eq(costCenters.orgId, ctx.org.id),
        ),
      )
      .limit(1);
    if (!costCenter) throw new Error("cost center not found");
  }

  const productIds = [...new Set(input.inputs.map((line) => line.productId))];
  if (productIds.length > 0) {
    const ownedProducts = await tx
      .select({ id: products.id })
      .from(products)
      .where(
        and(
          inArray(products.id, productIds),
          eq(products.orgId, ctx.org.id),
        ),
      );
    if (ownedProducts.length !== productIds.length) {
      throw new Error("product not found");
    }
  }

  // Real worker linkage: a labor line may point at a registered worker (in
  // addition to / instead of a free-text workerName), same and(eq(id),
  // eq(orgId)) tenancy guard as parcels/cycles/cost centers above.
  const workerIds = [
    ...new Set(
      input.labor
        .map((line) => line.workerId)
        .filter((id): id is string => Boolean(id)),
    ),
  ];
  if (workerIds.length > 0) {
    const ownedWorkers = await tx
      .select({ id: workers.id })
      .from(workers)
      .where(and(inArray(workers.id, workerIds), eq(workers.orgId, ctx.org.id)));
    if (ownedWorkers.length !== workerIds.length) {
      throw new Error("worker not found");
    }
  }

  // Only resolved when the activity actually consumes stock. Resolved before
  // totals so an empty input-line unitCost can be derived from this
  // warehouse's WAC before computeActivityTotals runs.
  const warehouse =
    input.inputs.length > 0
      ? await ensureDefaultWarehouseInTx(tx, ctx)
      : null;

  const resolvedInputs: Array<InputLine & { productId: string }> = [];
  for (const line of input.inputs) {
    const hasUnitCost =
      line.unitCost != null && String(line.unitCost).trim() !== "";
    if (hasUnitCost) {
      resolvedInputs.push({ ...line, unitCost: line.unitCost! });
      continue;
    }
    const derived = warehouse
      ? await deriveDefaultUnitCostInTx(tx, ctx, warehouse.id, line.productId)
      : undefined;
    if (derived == null) {
      throw new Error(
        "unit cost required: no stock history for product " + line.productId,
      );
    }
    resolvedInputs.push({ ...line, unitCost: derived });
  }

  const totals = computeActivityTotals({
    inputs: resolvedInputs,
    labor: input.labor,
    machineCost: input.machineCost,
    otherCost: input.otherCost,
  });

  const currencyCode = input.currencyCode ?? ctx.org.baseCurrencyCode;
  const exchangeRate =
    currencyCode === ctx.org.baseCurrencyCode
      ? "1"
      : await latestRateToBaseInTx(tx, ctx, currencyCode, input.date);
  if (exchangeRate == null) {
    throw new Error("missing exchange rate for " + currencyCode);
  }

  const activityId = input.id ?? newId();

  const [created] = await tx
    .insert(activities)
    .values({
      id: activityId,
      orgId: ctx.org.id,
      farmId,
      parcelId: input.parcelId ?? null,
      cropCycleId: input.cropCycleId ?? null,
      costCenterId: input.costCenterId ?? null,
      activityTypeId: input.activityTypeId,
      date: input.date,
      description: input.description ?? null,
      laborCost: totals.laborCost,
      inputCost: totals.inputCost,
      machineCost: totals.machineCost,
      otherCost: totals.otherCost,
      totalCost: totals.totalCost,
      currencyCode,
      exchangeRate,
      createdBy: ctx.user.id,
      createdOffline: input.createdOffline ?? false,
    })
    .onConflictDoNothing({ target: activities.id })
    .returning();

  // Idempotent replay from the offline outbox: row already exists. The org
  // filter matters — a crafted duplicate id must not read a foreign row.
  if (!created) {
    const [existing] = await tx
      .select()
      .from(activities)
      .where(
        and(eq(activities.id, activityId), eq(activities.orgId, ctx.org.id)),
      );
    if (!existing) throw new Error("activity id conflict");
    return existing;
  }

  if (resolvedInputs.length > 0) {
    const inputRows = resolvedInputs.map((line, i) => ({
      id: newId(),
      orgId: ctx.org.id,
      activityId,
      productId: line.productId,
      quantity: String(line.quantity),
      unitCost: String(line.unitCost),
      total: totals.inputTotals[i],
    }));
    await tx.insert(activityInputs).values(inputRows);

    // Consume stock: one signed (negative) movement per input line, tied to
    // the input row via refKind/refId so a replay can't double-consume.
    await tx
      .insert(inventoryMovements)
      .values(
        inputRows.map((row) => ({
          id: newId(),
          orgId: ctx.org.id,
          warehouseId: warehouse!.id,
          productId: row.productId,
          date: input.date,
          type: "consumption" as const,
          quantity: new Decimal(row.quantity).neg().toFixed(4),
          unitCost: null,
          refKind: "activity_input",
          refId: row.id,
          createdBy: ctx.user.id,
        })),
      )
      .onConflictDoNothing({
        target: [inventoryMovements.refKind, inventoryMovements.refId],
        where: sql`${inventoryMovements.refId} IS NOT NULL`,
      });
  }

  if (input.labor.length > 0) {
    await tx.insert(activityLabor).values(
      input.labor.map((line, i) => ({
        id: newId(),
        orgId: ctx.org.id,
        activityId,
        workerId: line.workerId ?? null,
        workerName: line.workerName ?? null,
        workersCount: line.workersCount,
        hours: line.hours != null ? String(line.hours) : null,
        rateType: line.rateType,
        rate: String(line.rate),
        amount: totals.laborAmounts[i],
      })),
    );
  }

  return created;
}

export async function createActivity(ctx: OrgContext, input: ActivityInput) {
  assertCan(ctx, "activity", "create");
  return withOrgRls(ctx.org.id, (tx) => createActivityInTx(tx, ctx, input));
}

export async function deleteActivity(ctx: OrgContext, activityId: string) {
  assertCan(ctx, "activity", "delete");
  await withOrgRls(ctx.org.id, (tx) =>
    tx
      .delete(activities)
      .where(
        and(eq(activities.id, activityId), eq(activities.orgId, ctx.org.id)),
      ),
  );
}

export async function listActivities(
  ctx: OrgContext,
  filter?: { parcelId?: string; cropCycleId?: string; limit?: number },
) {
  return withOrgRls(ctx.org.id, (tx) =>
    tx
      .select({
        activity: activities,
        typeName: activityTypes.name,
        parcelName: parcels.name,
        farmName: farms.name,
        cycleName: cropCycles.name,
      })
      .from(activities)
      .innerJoin(activityTypes, eq(activities.activityTypeId, activityTypes.id))
      .leftJoin(parcels, eq(activities.parcelId, parcels.id))
      .leftJoin(farms, eq(activities.farmId, farms.id))
      .leftJoin(cropCycles, eq(activities.cropCycleId, cropCycles.id))
      .where(
        and(
          eq(activities.orgId, ctx.org.id),
          filter?.parcelId ? eq(activities.parcelId, filter.parcelId) : undefined,
          filter?.cropCycleId
            ? eq(activities.cropCycleId, filter.cropCycleId)
            : undefined,
        ),
      )
      .orderBy(desc(activities.date), desc(activities.createdAt))
      .limit(filter?.limit ?? 200),
  );
}
