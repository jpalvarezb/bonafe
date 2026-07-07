import { and, asc, eq, isNull, or } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { withOrgRls, type Tx } from "@/lib/db/rls";
import { cropStages, crops } from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { newId } from "@/lib/ids";

/** Global rows (org_id NULL) plus the org's own rows. */
const globalOrOrg = (orgIdColumn: PgColumn, orgId: string) =>
  or(isNull(orgIdColumn), eq(orgIdColumn, orgId));

export type StageInput = {
  cropId: string;
  name: string;
  orderIndex?: number;
  typicalDurationDays?: number | null;
};

/** All stages (global + org) visible to the org, optionally filtered by crop. */
export async function listStages(ctx: OrgContext, cropId?: string) {
  return withOrgRls(ctx.org.id, (tx) =>
    tx
      .select()
      .from(cropStages)
      .where(
        and(
          globalOrOrg(cropStages.orgId, ctx.org.id),
          cropId ? eq(cropStages.cropId, cropId) : undefined,
        ),
      )
      .orderBy(asc(cropStages.cropId), asc(cropStages.orderIndex)),
  );
}

async function assertCropVisible(tx: Tx, ctx: OrgContext, cropId: string) {
  const [row] = await tx
    .select({ id: crops.id })
    .from(crops)
    .where(and(eq(crops.id, cropId), globalOrOrg(crops.orgId, ctx.org.id)))
    .limit(1);
  if (!row) throw new Error("crop not found");
}

export async function createStage(ctx: OrgContext, input: StageInput) {
  assertCan(ctx, "catalog", "manage");
  return withOrgRls(ctx.org.id, async (tx) => {
    await assertCropVisible(tx, ctx, input.cropId);
    const [created] = await tx
      .insert(cropStages)
      .values({
        id: newId(),
        orgId: ctx.org.id,
        cropId: input.cropId,
        name: input.name,
        orderIndex: input.orderIndex ?? 0,
        typicalDurationDays: input.typicalDurationDays ?? null,
      })
      .returning();
    return created;
  });
}

/** Only org-owned stages may be deleted; global (org_id NULL) rows never match. */
export async function deleteStage(ctx: OrgContext, stageId: string) {
  assertCan(ctx, "catalog", "manage");
  await withOrgRls(ctx.org.id, (tx) =>
    tx
      .delete(cropStages)
      .where(and(eq(cropStages.id, stageId), eq(cropStages.orgId, ctx.org.id))),
  );
}
