import { and, eq } from "drizzle-orm";
import { db } from "@/lib/db";
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
  const [created] = await db
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
}

export async function updateFarm(
  ctx: OrgContext,
  farmId: string,
  input: Partial<FarmInput>,
) {
  assertCan(ctx, "farm", "update");
  const [updated] = await db
    .update(farms)
    .set(input)
    .where(and(eq(farms.id, farmId), eq(farms.orgId, ctx.org.id)))
    .returning();
  return updated;
}

/** Soft toggle of active/inactive; farms are never hard-deleted. */
export async function setFarmActive(
  ctx: OrgContext,
  farmId: string,
  active: boolean,
) {
  assertCan(ctx, "farm", "delete");
  const [updated] = await db
    .update(farms)
    .set({ active })
    .where(and(eq(farms.id, farmId), eq(farms.orgId, ctx.org.id)))
    .returning();
  return updated;
}

/** Full farm list. Pass includeInactive to also show deactivated farms. */
export async function listFarms(
  ctx: OrgContext,
  filter?: { includeInactive?: boolean },
) {
  return db
    .select()
    .from(farms)
    .where(
      and(
        eq(farms.orgId, ctx.org.id),
        filter?.includeInactive ? undefined : eq(farms.active, true),
      ),
    )
    .orderBy(farms.name);
}

export async function getFarm(ctx: OrgContext, farmId: string) {
  const [farm] = await db
    .select()
    .from(farms)
    .where(and(eq(farms.id, farmId), eq(farms.orgId, ctx.org.id)))
    .limit(1);
  return farm ?? null;
}
