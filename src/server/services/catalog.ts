import { and, asc, eq, isNull, or } from "drizzle-orm";
import type { PgColumn } from "drizzle-orm/pg-core";
import { withOrgRls } from "@/lib/db/rls";
import {
  activityTypes,
  crops,
  cropVarieties,
  products,
} from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { newId } from "@/lib/ids";

/** Global rows (org_id NULL) plus the org's own rows. */
const globalOrOrg = (orgIdColumn: PgColumn, orgId: string) =>
  or(isNull(orgIdColumn), eq(orgIdColumn, orgId));

export async function listCrops(ctx: OrgContext) {
  return withOrgRls(ctx.org.id, (tx) =>
    tx
      .select()
      .from(crops)
      .where(globalOrOrg(crops.orgId, ctx.org.id))
      .orderBy(asc(crops.name)),
  );
}

export async function listVarieties(ctx: OrgContext, cropId?: string) {
  return withOrgRls(ctx.org.id, (tx) =>
    tx
      .select()
      .from(cropVarieties)
      .where(
        and(
          globalOrOrg(cropVarieties.orgId, ctx.org.id),
          cropId ? eq(cropVarieties.cropId, cropId) : undefined,
        ),
      )
      .orderBy(asc(cropVarieties.name)),
  );
}

export async function createCrop(
  ctx: OrgContext,
  input: { name: string; scientificName?: string; defaultCycleDays?: number },
) {
  assertCan(ctx, "catalog", "manage");
  return withOrgRls(ctx.org.id, async (tx) => {
    const [created] = await tx
      .insert(crops)
      .values({
        id: newId(),
        orgId: ctx.org.id,
        name: input.name,
        scientificName: input.scientificName ?? null,
        defaultCycleDays: input.defaultCycleDays ?? null,
      })
      .returning();
    return created;
  });
}

export async function createVariety(
  ctx: OrgContext,
  input: { cropId: string; name: string; notes?: string },
) {
  assertCan(ctx, "catalog", "manage");
  return withOrgRls(ctx.org.id, async (tx) => {
    const [created] = await tx
      .insert(cropVarieties)
      .values({
        id: newId(),
        orgId: ctx.org.id,
        cropId: input.cropId,
        name: input.name,
        notes: input.notes ?? null,
      })
      .returning();
    return created;
  });
}

export async function listActivityTypes(ctx: OrgContext) {
  return withOrgRls(ctx.org.id, (tx) =>
    tx
      .select()
      .from(activityTypes)
      .where(globalOrOrg(activityTypes.orgId, ctx.org.id))
      .orderBy(asc(activityTypes.name)),
  );
}

export async function createActivityType(
  ctx: OrgContext,
  input: { name: string; category?: "field" | "general" | "machine" },
) {
  assertCan(ctx, "catalog", "manage");
  return withOrgRls(ctx.org.id, async (tx) => {
    const [created] = await tx
      .insert(activityTypes)
      .values({
        id: newId(),
        orgId: ctx.org.id,
        name: input.name,
        category: input.category ?? "field",
      })
      .returning();
    return created;
  });
}

export type ProductInput = {
  name: string;
  category?: "fertilizer" | "agrochemical" | "seed" | "tool" | "fuel" | "other";
  unit?: string;
  activeIngredient?: string;
};

export async function listProducts(ctx: OrgContext) {
  return withOrgRls(ctx.org.id, (tx) =>
    tx
      .select()
      .from(products)
      .where(eq(products.orgId, ctx.org.id))
      .orderBy(asc(products.name)),
  );
}

export async function createProduct(ctx: OrgContext, input: ProductInput) {
  assertCan(ctx, "catalog", "manage");
  return withOrgRls(ctx.org.id, async (tx) => {
    const [created] = await tx
      .insert(products)
      .values({
        id: newId(),
        orgId: ctx.org.id,
        name: input.name,
        category: input.category ?? "other",
        unit: input.unit ?? "unidad",
        activeIngredient: input.activeIngredient ?? null,
      })
      .returning();
    return created;
  });
}
