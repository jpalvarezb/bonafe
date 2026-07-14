import { and, asc, eq } from "drizzle-orm";
import Decimal from "decimal.js";
import { withOrgRls, type Tx } from "@/lib/db/rls";
import { inventoryMovements, products, warehouses } from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { assertOrgFeature } from "@/lib/plan-limits";
import { newId } from "@/lib/ids";
import { computeStock, type MovementLine } from "@/lib/calc/inventory";

function today(): string {
  return new Date().toISOString().slice(0, 10);
}

export async function listWarehouses(ctx: OrgContext) {
  return withOrgRls(ctx.org.id, (tx) =>
    tx
      .select()
      .from(warehouses)
      .where(eq(warehouses.orgId, ctx.org.id))
      .orderBy(asc(warehouses.name)),
  );
}

/**
 * Returns the org's default warehouse, creating "Bodega Central" on first use.
 * Race-safe: the partial unique index warehouses_org_default_uq allows only
 * one default per org, so a concurrent double-insert no-ops and both callers
 * converge on the surviving row via the re-select.
 *
 * Exported as an `...InTx` variant too: activities/purchases creating a
 * record need this inside their OWN transaction, not a second nested one.
 */
export async function ensureDefaultWarehouseInTx(tx: Tx, ctx: OrgContext) {
  const [existing] = await tx
    .select()
    .from(warehouses)
    .where(and(eq(warehouses.orgId, ctx.org.id), eq(warehouses.isDefault, true)))
    .limit(1);
  if (existing) return existing;

  await tx
    .insert(warehouses)
    .values({
      id: newId(),
      orgId: ctx.org.id,
      name: "Bodega Central",
      isDefault: true,
    })
    .onConflictDoNothing();

  const [created] = await tx
    .select()
    .from(warehouses)
    .where(and(eq(warehouses.orgId, ctx.org.id), eq(warehouses.isDefault, true)))
    .limit(1);
  if (!created) throw new Error("failed to create default warehouse");
  return created;
}

export async function ensureDefaultWarehouse(ctx: OrgContext) {
  return withOrgRls(ctx.org.id, (tx) => ensureDefaultWarehouseInTx(tx, ctx));
}

export type AdjustmentInput = {
  productId: string;
  warehouseId: string;
  direction: "in" | "out";
  quantity: string;
  unitCost?: string | null;
  notes?: string | null;
};

export async function recordAdjustment(ctx: OrgContext, input: AdjustmentInput) {
  assertCan(ctx, "inventory", "manage");
  await assertOrgFeature(ctx.org.id, "inventory");

  return withOrgRls(ctx.org.id, async (tx) => {
    const [product] = await tx
      .select({ id: products.id })
      .from(products)
      .where(
        and(eq(products.id, input.productId), eq(products.orgId, ctx.org.id)),
      )
      .limit(1);
    if (!product) throw new Error("product not found");

    const [warehouse] = await tx
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(
        and(
          eq(warehouses.id, input.warehouseId),
          eq(warehouses.orgId, ctx.org.id),
        ),
      )
      .limit(1);
    if (!warehouse) throw new Error("warehouse not found");

    const qty = new Decimal(input.quantity || 0).abs();
    const signedQty = input.direction === "in" ? qty : qty.neg();

    const [created] = await tx
      .insert(inventoryMovements)
      .values({
        id: newId(),
        orgId: ctx.org.id,
        warehouseId: input.warehouseId,
        productId: input.productId,
        date: today(),
        type: input.direction === "in" ? "adjustment_in" : "adjustment_out",
        quantity: signedQty.toFixed(4),
        unitCost:
          input.direction === "in" && input.unitCost
            ? String(input.unitCost)
            : null,
        notes: input.notes ?? null,
        createdBy: ctx.user.id,
      })
      .returning();
    return created;
  });
}

export type StockRow = {
  productId: string;
  productName: string;
  unit: string;
  minStock: string | null;
  warehouseId: string;
  warehouseName: string;
  isDefaultWarehouse: boolean;
  quantity: string;
  avgUnitCost: string;
  totalValue: string;
};

/** Weighted-average stock per (warehouse, product), folded over the signed ledger. */
export async function getStockByProduct(ctx: OrgContext): Promise<StockRow[]> {
  const { defaultWarehouseId, rows } = await withOrgRls(ctx.org.id, async (tx) => {
    const [defaultWarehouse] = await tx
      .select({ id: warehouses.id })
      .from(warehouses)
      .where(and(eq(warehouses.orgId, ctx.org.id), eq(warehouses.isDefault, true)))
      .limit(1);

    const movementRows = await tx
      .select({
        productId: inventoryMovements.productId,
        productName: products.name,
        unit: products.unit,
        minStock: products.minStock,
        warehouseId: inventoryMovements.warehouseId,
        warehouseName: warehouses.name,
        quantity: inventoryMovements.quantity,
        unitCost: inventoryMovements.unitCost,
      })
      .from(inventoryMovements)
      .innerJoin(products, eq(inventoryMovements.productId, products.id))
      .innerJoin(warehouses, eq(inventoryMovements.warehouseId, warehouses.id))
      .where(eq(inventoryMovements.orgId, ctx.org.id))
      .orderBy(asc(inventoryMovements.date), asc(inventoryMovements.createdAt));

    return { defaultWarehouseId: defaultWarehouse?.id ?? null, rows: movementRows };
  });

  type Group = {
    productId: string;
    productName: string;
    unit: string;
    minStock: string | null;
    warehouseId: string;
    warehouseName: string;
    movements: MovementLine[];
  };

  const groups = new Map<string, Group>();
  for (const row of rows) {
    const key = `${row.warehouseId}:${row.productId}`;
    let group = groups.get(key);
    if (!group) {
      group = {
        productId: row.productId,
        productName: row.productName,
        unit: row.unit,
        minStock: row.minStock,
        warehouseId: row.warehouseId,
        warehouseName: row.warehouseName,
        movements: [],
      };
      groups.set(key, group);
    }
    group.movements.push({ quantity: row.quantity, unitCost: row.unitCost });
  }

  return [...groups.values()]
    .map((group) => {
      const stock = computeStock(group.movements);
      return {
        productId: group.productId,
        productName: group.productName,
        unit: group.unit,
        minStock: group.minStock,
        warehouseId: group.warehouseId,
        warehouseName: group.warehouseName,
        isDefaultWarehouse: group.warehouseId === defaultWarehouseId,
        ...stock,
      };
    })
    .sort(
      (a, b) =>
        a.productName.localeCompare(b.productName) ||
        a.warehouseName.localeCompare(b.warehouseName),
    );
}
