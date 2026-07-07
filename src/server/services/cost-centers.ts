import { and, eq } from "drizzle-orm";
import { withOrgRls } from "@/lib/db/rls";
import { costCenters } from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { newId } from "@/lib/ids";

export type CostCenterInput = {
  name: string;
  parentId?: string | null;
};

export async function listCostCenters(ctx: OrgContext) {
  return withOrgRls(ctx.org.id, (tx) =>
    tx
      .select()
      .from(costCenters)
      .where(eq(costCenters.orgId, ctx.org.id))
      .orderBy(costCenters.name),
  );
}

export async function createCostCenter(
  ctx: OrgContext,
  input: CostCenterInput,
) {
  assertCan(ctx, "cost_center", "manage");
  return withOrgRls(ctx.org.id, async (tx) => {
    if (input.parentId) {
      const [parent] = await tx
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
    const [created] = await tx
      .insert(costCenters)
      .values({
        id: newId(),
        orgId: ctx.org.id,
        name: input.name,
        parentId: input.parentId ?? null,
      })
      .returning();
    return created;
  });
}

export async function deleteCostCenter(ctx: OrgContext, id: string) {
  assertCan(ctx, "cost_center", "manage");
  return withOrgRls(ctx.org.id, async (tx) => {
    await tx
      .delete(costCenters)
      .where(and(eq(costCenters.id, id), eq(costCenters.orgId, ctx.org.id)));
  });
}
