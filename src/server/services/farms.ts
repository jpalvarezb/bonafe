import { cache } from "react";
import { and, eq } from "drizzle-orm";
import { withOrgRls, type Tx } from "@/lib/db/rls";
import { farms } from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { newId } from "@/lib/ids";

export type FarmInput = {
  name: string;
  areaHa?: string | null;
  notes?: string | null;
};

export async function createFarm(ctx: OrgContext, input: FarmInput) {
  assertCan(ctx, "farm", "create");
  return withOrgRls(ctx.org.id, async (tx) => {
    const [created] = await tx
      .insert(farms)
      .values({
        id: newId(),
        orgId: ctx.org.id,
        name: input.name,
        areaHa: input.areaHa ?? null,
        notes: input.notes ?? null,
      })
      .returning();
    return created;
  });
}

export async function updateFarm(
  ctx: OrgContext,
  farmId: string,
  input: Partial<FarmInput>,
) {
  assertCan(ctx, "farm", "update");
  return withOrgRls(ctx.org.id, async (tx) => {
    const [updated] = await tx
      .update(farms)
      .set(input)
      .where(and(eq(farms.id, farmId), eq(farms.orgId, ctx.org.id)))
      .returning();
    return updated;
  });
}

/** Soft toggle of active/inactive; farms are never hard-deleted. */
export async function setFarmActive(
  ctx: OrgContext,
  farmId: string,
  active: boolean,
) {
  assertCan(ctx, "farm", "delete");
  return withOrgRls(ctx.org.id, async (tx) => {
    const [updated] = await tx
      .update(farms)
      .set({ active })
      .where(and(eq(farms.id, farmId), eq(farms.orgId, ctx.org.id)))
      .returning();
    return updated;
  });
}

/** Full farm list. Pass includeInactive to also show deactivated farms. */
export async function listFarms(
  ctx: OrgContext,
  filter?: { includeInactive?: boolean },
) {
  return withOrgRls(ctx.org.id, (tx) =>
    tx
      .select()
      .from(farms)
      .where(
        and(
          eq(farms.orgId, ctx.org.id),
          filter?.includeInactive ? undefined : eq(farms.active, true),
        ),
      )
      .orderBy(farms.name),
  );
}

/**
 * Cheap id/name farm list for the header farm-switcher. Takes `orgId`
 * (not `ctx`, unlike `listFarms` above) because `requireOrgContext` returns
 * a fresh object on every call — React's `cache()` dedupes by argument
 * identity, so keying on the stable orgId string (same pattern as
 * `getOrgPlan` in plan-limits.ts) actually dedupes across the org layout
 * and any page that separately resolves its own OrgContext in the same
 * request, where keying on `ctx` would not.
 */
export const listFarmNames = cache(async function listFarmNames(
  orgId: string,
): Promise<{ id: string; name: string }[]> {
  return withOrgRls(orgId, (tx) =>
    tx
      .select({ id: farms.id, name: farms.name })
      .from(farms)
      .where(and(eq(farms.orgId, orgId), eq(farms.active, true)))
      .orderBy(farms.name),
  );
});

/**
 * Exported as an `...InTx` variant too: climate-ingest's ingestRainfall
 * needs this inside its own transaction, not a second nested one.
 */
export async function getFarmInTx(tx: Tx, ctx: OrgContext, farmId: string) {
  const [farm] = await tx
    .select()
    .from(farms)
    .where(and(eq(farms.id, farmId), eq(farms.orgId, ctx.org.id)))
    .limit(1);
  return farm ?? null;
}

export async function getFarm(ctx: OrgContext, farmId: string) {
  return withOrgRls(ctx.org.id, (tx) => getFarmInTx(tx, ctx, farmId));
}
