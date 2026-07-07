import { alias } from "drizzle-orm/pg-core";
import { and, asc, count, desc, eq, inArray } from "drizzle-orm";
import Decimal from "decimal.js";
import { withOrgRls } from "@/lib/db/rls";
import {
  inventoryMovements,
  inventoryTransferLines,
  inventoryTransfers,
  products,
  warehouses,
} from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { assertOrgFeature } from "@/lib/plan-limits";
import { newId } from "@/lib/ids";
import { computeStock, type MovementLine, type StockState } from "@/lib/calc/inventory";

export type TransferLineInput = {
  productId: string;
  quantity: string;
};

export type TransferInput = {
  fromWarehouseId: string;
  toWarehouseId: string;
  date: string;
  notes?: string | null;
  lines: TransferLineInput[];
};

/**
 * Atomic stock move between two warehouses in the same org. Each line is
 * valued at the source warehouse's current weighted-average unit cost
 * (unitCostSnapshot); the destination's average is then re-weighted by that
 * explicit cost via the transfer_in movement. Throws "insufficient stock"
 * rather than allowing a source warehouse to go negative — quantities
 * requested for the same product across multiple lines in one transfer are
 * summed against a single stock snapshot so a split request can't bypass
 * the check.
 */
export async function createTransfer(ctx: OrgContext, input: TransferInput) {
  assertCan(ctx, "inventory", "manage");
  await assertOrgFeature(ctx.org.id, "warehouses");

  if (input.lines.length === 0) {
    throw new Error("transfer must have at least one line");
  }
  if (input.fromWarehouseId === input.toWarehouseId) {
    throw new Error("source and destination warehouses must differ");
  }

  const warehouseIds = [input.fromWarehouseId, input.toWarehouseId];
  const productIds = [...new Set(input.lines.map((line) => line.productId))];
  const transferId = newId();

  return withOrgRls(ctx.org.id, async (tx) => {
    const ownedWarehouses = await tx
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(
        and(inArray(warehouses.id, warehouseIds), eq(warehouses.orgId, ctx.org.id)),
      );
    if (ownedWarehouses.length !== 2) {
      throw new Error("warehouse not found");
    }

    const ownedProducts = await tx
      .select({ id: products.id })
      .from(products)
      .where(and(inArray(products.id, productIds), eq(products.orgId, ctx.org.id)));
    if (ownedProducts.length !== productIds.length) {
      throw new Error("product not found");
    }

    // Serialize transfers out of this warehouse: a concurrent transfer blocks
    // on this row lock until we commit, then re-reads a ledger that already
    // includes our outbound movements — closing the check-then-insert race
    // that could otherwise drive the source stock negative.
    await tx
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(
        and(
          eq(warehouses.id, input.fromWarehouseId),
          eq(warehouses.orgId, ctx.org.id),
        ),
      )
      .for("update");

    // Source-warehouse ledger (read under the lock), sorted for computeStock.
    const sourceMovements = await tx
      .select({
        productId: inventoryMovements.productId,
        quantity: inventoryMovements.quantity,
        unitCost: inventoryMovements.unitCost,
      })
      .from(inventoryMovements)
      .where(
        and(
          eq(inventoryMovements.orgId, ctx.org.id),
          eq(inventoryMovements.warehouseId, input.fromWarehouseId),
          inArray(inventoryMovements.productId, productIds),
        ),
      )
      .orderBy(asc(inventoryMovements.date), asc(inventoryMovements.createdAt));

    const movementsByProduct = new Map<string, MovementLine[]>();
    for (const row of sourceMovements) {
      const list = movementsByProduct.get(row.productId) ?? [];
      list.push({ quantity: row.quantity, unitCost: row.unitCost });
      movementsByProduct.set(row.productId, list);
    }

    const stockByProduct = new Map<string, StockState>();
    const remainingByProduct = new Map<string, Decimal>();
    for (const productId of productIds) {
      const stock = computeStock(movementsByProduct.get(productId) ?? []);
      stockByProduct.set(productId, stock);
      remainingByProduct.set(productId, new Decimal(stock.quantity));
    }

    const lineIds = input.lines.map(() => newId());
    const linePlans = input.lines.map((line, i) => {
      const requested = new Decimal(line.quantity);
      const remaining = remainingByProduct.get(line.productId)!;
      if (requested.gt(remaining)) {
        throw new Error("insufficient stock");
      }
      remainingByProduct.set(line.productId, remaining.sub(requested));

      return {
        id: lineIds[i],
        productId: line.productId,
        quantity: requested.toFixed(4),
        unitCostSnapshot: stockByProduct.get(line.productId)!.avgUnitCost,
      };
    });

    const [created] = await tx
      .insert(inventoryTransfers)
      .values({
        id: transferId,
        orgId: ctx.org.id,
        fromWarehouseId: input.fromWarehouseId,
        toWarehouseId: input.toWarehouseId,
        date: input.date,
        notes: input.notes ?? null,
        createdBy: ctx.user.id,
      })
      .returning();

    await tx.insert(inventoryTransferLines).values(
      linePlans.map((line) => ({
        id: line.id,
        orgId: ctx.org.id,
        transferId,
        productId: line.productId,
        quantity: line.quantity,
        unitCostSnapshot: line.unitCostSnapshot,
      })),
    );

    await tx.insert(inventoryMovements).values(
      linePlans.flatMap((line) => [
        {
          id: newId(),
          orgId: ctx.org.id,
          warehouseId: input.fromWarehouseId,
          productId: line.productId,
          date: input.date,
          type: "transfer_out" as const,
          quantity: new Decimal(line.quantity).neg().toFixed(4),
          unitCost: null,
          refKind: "transfer_line_out",
          refId: line.id,
          createdBy: ctx.user.id,
        },
        {
          id: newId(),
          orgId: ctx.org.id,
          warehouseId: input.toWarehouseId,
          productId: line.productId,
          date: input.date,
          type: "transfer_in" as const,
          quantity: line.quantity,
          unitCost: line.unitCostSnapshot,
          refKind: "transfer_line_in",
          refId: line.id,
          createdBy: ctx.user.id,
        },
      ]),
    );

    return created;
  });
}

export async function listTransfers(ctx: OrgContext) {
  const fromWarehouses = alias(warehouses, "from_warehouse");
  const toWarehouses = alias(warehouses, "to_warehouse");

  return withOrgRls(ctx.org.id, (tx) =>
    tx
      .select({
        transfer: inventoryTransfers,
        fromWarehouseName: fromWarehouses.name,
        toWarehouseName: toWarehouses.name,
        lineCount: count(inventoryTransferLines.id),
      })
      .from(inventoryTransfers)
      .innerJoin(fromWarehouses, eq(inventoryTransfers.fromWarehouseId, fromWarehouses.id))
      .innerJoin(toWarehouses, eq(inventoryTransfers.toWarehouseId, toWarehouses.id))
      .leftJoin(
        inventoryTransferLines,
        eq(inventoryTransferLines.transferId, inventoryTransfers.id),
      )
      .where(eq(inventoryTransfers.orgId, ctx.org.id))
      .groupBy(inventoryTransfers.id, fromWarehouses.name, toWarehouses.name)
      .orderBy(desc(inventoryTransfers.date), desc(inventoryTransfers.createdAt)),
  );
}
