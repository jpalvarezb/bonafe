"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrgContext } from "@/lib/tenancy";
import {
  createWarehouse,
  setDefaultWarehouse,
  updateWarehouse,
} from "@/server/services/warehouses";

const scope = z.object({ locale: z.string(), orgSlug: z.string() });

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
}

export async function createWarehouseAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  await createWarehouse(ctx, {
    name: z.string().min(1).parse(formData.get("name")),
    farmId: str(formData, "farmId") ?? null,
  });
  revalidatePath(`/${locale}/o/${orgSlug}/warehouses`);
}

export async function updateWarehouseAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const id = z.string().uuid().parse(formData.get("id"));
  await updateWarehouse(ctx, id, {
    name: z.string().min(1).parse(formData.get("name")),
    farmId: str(formData, "farmId") ?? null,
  });
  revalidatePath(`/${locale}/o/${orgSlug}/warehouses`);
  redirect(`/${locale}/o/${orgSlug}/warehouses`);
}

export async function setDefaultWarehouseAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const id = z.string().uuid().parse(formData.get("id"));
  await setDefaultWarehouse(ctx, id);
  revalidatePath(`/${locale}/o/${orgSlug}/warehouses`);
  redirect(`/${locale}/o/${orgSlug}/warehouses`);
}
