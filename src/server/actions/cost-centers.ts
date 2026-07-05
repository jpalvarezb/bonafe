"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/tenancy";
import {
  createCostCenter,
  deleteCostCenter,
} from "@/server/services/cost-centers";

const scope = z.object({ locale: z.string(), orgSlug: z.string() });

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
}

export async function createCostCenterAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  await createCostCenter(ctx, {
    name: z.string().min(1).parse(formData.get("name")),
    parentId: str(formData, "parentId") ?? null,
  });
  revalidatePath(`/${locale}/o/${orgSlug}/cost-centers`);
}

export async function deleteCostCenterAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const id = z.string().uuid().parse(formData.get("id"));
  await deleteCostCenter(ctx, id);
  revalidatePath(`/${locale}/o/${orgSlug}/cost-centers`);
}
