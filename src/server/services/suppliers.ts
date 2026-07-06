import { and, asc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { suppliers } from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { assertOrgFeature } from "@/lib/plan-limits";
import { newId } from "@/lib/ids";

export type SupplierInput = {
  name: string;
  contactName?: string | null;
  phone?: string | null;
  email?: string | null;
  taxId?: string | null;
  notes?: string | null;
};

export async function listSuppliers(ctx: OrgContext) {
  return db
    .select()
    .from(suppliers)
    .where(eq(suppliers.orgId, ctx.org.id))
    .orderBy(asc(suppliers.name));
}

export async function getSupplier(ctx: OrgContext, id: string) {
  const [row] = await db
    .select()
    .from(suppliers)
    .where(and(eq(suppliers.id, id), eq(suppliers.orgId, ctx.org.id)))
    .limit(1);
  return row ?? null;
}

export async function createSupplier(ctx: OrgContext, input: SupplierInput) {
  assertCan(ctx, "inventory", "manage");
  await assertOrgFeature(ctx.org.id, "inventory");
  const [created] = await db
    .insert(suppliers)
    .values({
      id: newId(),
      orgId: ctx.org.id,
      name: input.name,
      contactName: input.contactName ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      taxId: input.taxId ?? null,
      notes: input.notes ?? null,
    })
    .returning();
  return created;
}

export async function updateSupplier(
  ctx: OrgContext,
  id: string,
  input: SupplierInput,
) {
  assertCan(ctx, "inventory", "manage");
  await assertOrgFeature(ctx.org.id, "inventory");
  const [updated] = await db
    .update(suppliers)
    .set({
      name: input.name,
      contactName: input.contactName ?? null,
      phone: input.phone ?? null,
      email: input.email ?? null,
      taxId: input.taxId ?? null,
      notes: input.notes ?? null,
    })
    .where(and(eq(suppliers.id, id), eq(suppliers.orgId, ctx.org.id)))
    .returning();
  if (!updated) throw new Error("supplier not found");
  return updated;
}

export async function deleteSupplier(ctx: OrgContext, id: string) {
  assertCan(ctx, "inventory", "manage");
  await assertOrgFeature(ctx.org.id, "inventory");
  await db
    .delete(suppliers)
    .where(and(eq(suppliers.id, id), eq(suppliers.orgId, ctx.org.id)));
}
