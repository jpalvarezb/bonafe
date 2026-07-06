import { and, desc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import Decimal from "decimal.js";
import { db } from "@/lib/db";
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
} from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { newId } from "@/lib/ids";
import {
  computeActivityTotals,
  type InputLine,
  type LaborLine,
} from "@/lib/calc/costs";
import { latestRateToBase } from "@/server/services/exchange-rates";
import { ensureDefaultWarehouse } from "@/server/services/inventory";

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
  inputs: Array<InputLine & { productId: string }>;
  labor: Array<LaborLine & { workerName?: string | null }>;
};

export async function createActivity(ctx: OrgContext, input: ActivityInput) {
  assertCan(ctx, "activity", "create");

  let farmId: string | null = null;
  if (input.parcelId) {
    const [parcel] = await db
      .select({ farmId: parcels.farmId })
      .from(parcels)
      .where(
        and(eq(parcels.id, input.parcelId), eq(parcels.orgId, ctx.org.id)),
      )
      .limit(1);
    if (!parcel) throw new Error("parcel not found");
    farmId = parcel.farmId;
  }

  // Every client-supplied FK must resolve inside the caller's org (activity
  // types may also be global catalog rows with org_id NULL).
  const [activityType] = await db
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
    const [cycle] = await db
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
    const [costCenter] = await db
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
    const ownedProducts = await db
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

  const totals = computeActivityTotals({
    inputs: input.inputs,
    labor: input.labor,
    machineCost: input.machineCost,
    otherCost: input.otherCost,
  });

  const currencyCode = input.currencyCode ?? ctx.org.baseCurrencyCode;
  const exchangeRate =
    currencyCode === ctx.org.baseCurrencyCode
      ? "1"
      : await latestRateToBase(ctx, currencyCode, input.date);
  if (exchangeRate == null) {
    throw new Error("missing exchange rate for " + currencyCode);
  }

  const activityId = input.id ?? newId();

  // Resolved outside the transaction (ensureDefaultWarehouse does its own
  // select-then-insert); only needed when the activity actually consumes stock.
  const warehouse =
    input.inputs.length > 0 ? await ensureDefaultWarehouse(ctx) : null;

  return db.transaction(async (tx) => {
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

    if (input.inputs.length > 0) {
      const inputRows = input.inputs.map((line, i) => ({
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
  });
}

export async function deleteActivity(ctx: OrgContext, activityId: string) {
  assertCan(ctx, "activity", "delete");
  await db
    .delete(activities)
    .where(
      and(eq(activities.id, activityId), eq(activities.orgId, ctx.org.id)),
    );
}

export async function listActivities(
  ctx: OrgContext,
  filter?: { parcelId?: string; cropCycleId?: string; limit?: number },
) {
  return db
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
    .limit(filter?.limit ?? 200);
}
