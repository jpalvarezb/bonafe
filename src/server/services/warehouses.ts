import { and, asc, count, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { farms, inventoryMovements, warehouses } from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { assertOrgFeature } from "@/lib/plan-limits";
import { newId } from "@/lib/ids";

export type WarehouseInput = {
  name: string;
  farmId?: string | null;
};

async function assertFarmInOrg(ctx: OrgContext, farmId: string) {
  const [farm] = await db
    .select({ id: farms.id })
    .from(farms)
    .where(and(eq(farms.id, farmId), eq(farms.orgId, ctx.org.id)))
    .limit(1);
  if (!farm) throw new Error("farm not found");
}

/**
 * Org-scoped warehouse list, name asc. Deliberately not imported from
 * services/inventory.ts (which owns the movement-ledger reads) — this
 * service owns warehouse CRUD independently.
 */
export async function listWarehouses(ctx: OrgContext) {
  return db
    .select()
    .from(warehouses)
    .where(eq(warehouses.orgId, ctx.org.id))
    .orderBy(asc(warehouses.name));
}

export type WarehouseWithStats = {
  id: string;
  name: string;
  farmId: string | null;
  farmName: string | null;
  isDefault: boolean;
  movementCount: number;
};

/** List view for the warehouses page: farm name + total movement count. */
export async function listWarehousesWithStats(
  ctx: OrgContext,
): Promise<WarehouseWithStats[]> {
  return db
    .select({
      id: warehouses.id,
      name: warehouses.name,
      farmId: warehouses.farmId,
      farmName: farms.name,
      isDefault: warehouses.isDefault,
      movementCount: count(inventoryMovements.id),
    })
    .from(warehouses)
    .leftJoin(farms, eq(warehouses.farmId, farms.id))
    .leftJoin(inventoryMovements, eq(inventoryMovements.warehouseId, warehouses.id))
    .where(eq(warehouses.orgId, ctx.org.id))
    .groupBy(warehouses.id, farms.name)
    .orderBy(asc(warehouses.name));
}

export async function getWarehouse(ctx: OrgContext, id: string) {
  const [row] = await db
    .select()
    .from(warehouses)
    .where(and(eq(warehouses.id, id), eq(warehouses.orgId, ctx.org.id)))
    .limit(1);
  return row ?? null;
}

export async function createWarehouse(ctx: OrgContext, input: WarehouseInput) {
  assertCan(ctx, "inventory", "manage");
  await assertOrgFeature(ctx.org.id, "warehouses");
  if (input.farmId) await assertFarmInOrg(ctx, input.farmId);

  const [created] = await db
    .insert(warehouses)
    .values({
      id: newId(),
      orgId: ctx.org.id,
      name: input.name,
      farmId: input.farmId ?? null,
    })
    .returning();
  return created;
}

export async function updateWarehouse(
  ctx: OrgContext,
  id: string,
  input: WarehouseInput,
) {
  assertCan(ctx, "inventory", "manage");
  await assertOrgFeature(ctx.org.id, "warehouses");
  if (input.farmId) await assertFarmInOrg(ctx, input.farmId);

  const [updated] = await db
    .update(warehouses)
    .set({
      name: input.name,
      farmId: input.farmId ?? null,
    })
    .where(and(eq(warehouses.id, id), eq(warehouses.orgId, ctx.org.id)))
    .returning();
  if (!updated) throw new Error("warehouse not found");
  return updated;
}

/**
 * Makes `warehouseId` the org's sole default warehouse. Runs in one
 * transaction, clearing the current default before setting the new one —
 * required because warehouses_org_default_uq is a partial unique index
 * allowing at most one isDefault=true row per org at any instant (setting
 * the new default before clearing the old one would violate it).
 */
export async function setDefaultWarehouse(ctx: OrgContext, warehouseId: string) {
  assertCan(ctx, "inventory", "manage");
  await assertOrgFeature(ctx.org.id, "warehouses");

  const [target] = await db
    .select({ id: warehouses.id })
    .from(warehouses)
    .where(and(eq(warehouses.id, warehouseId), eq(warehouses.orgId, ctx.org.id)))
    .limit(1);
  if (!target) throw new Error("warehouse not found");

  await db.transaction(async (tx) => {
    await tx
      .update(warehouses)
      .set({ isDefault: false })
      .where(and(eq(warehouses.orgId, ctx.org.id), eq(warehouses.isDefault, true)));
    await tx
      .update(warehouses)
      .set({ isDefault: true })
      .where(and(eq(warehouses.id, warehouseId), eq(warehouses.orgId, ctx.org.id)));
  });
}
