import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { costCenters } from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { newId } from "@/lib/ids";

export type CostCenterInput = {
  name: string;
  parentId?: string | null;
};

export async function listCostCenters(ctx: OrgContext) {
  return db
    .select()
    .from(costCenters)
    .where(eq(costCenters.orgId, ctx.org.id))
    .orderBy(costCenters.name);
}

export async function createCostCenter(
  ctx: OrgContext,
  input: CostCenterInput,
) {
  assertCan(ctx, "cost_center", "manage");
  if (input.parentId) {
    const [parent] = await db
      .select({ id: costCenters.id })
      .from(costCenters)
      .where(
        and(
          eq(costCenters.id, input.parentId),
          eq(costCenters.orgId, ctx.org.id),
        ),
      )
      .limit(1);
    if (!parent) throw new Error("parent cost center not found");
  }
  const [created] = await db
    .insert(costCenters)
    .values({
      id: newId(),
      orgId: ctx.org.id,
      name: input.name,
      parentId: input.parentId ?? null,
    })
    .returning();
  return created;
}

export async function deleteCostCenter(ctx: OrgContext, id: string) {
  assertCan(ctx, "cost_center", "manage");
  await db
    .delete(costCenters)
    .where(and(eq(costCenters.id, id), eq(costCenters.orgId, ctx.org.id)));
}
