"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/tenancy";
import { createStage, deleteStage } from "@/server/services/stages";

const scope = z.object({
  locale: z.string(),
  orgSlug: z.string(),
});

function parseScope(formData: FormData) {
  const parsed = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  // Derived server-side — a client-supplied path would let a crafted payload
  // bust arbitrary route caches.
  return {
    ...parsed,
    path: `/${parsed.locale}/o/${parsed.orgSlug}/catalog/stages`,
  };
}

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
}

export async function createStageAction(formData: FormData) {
  const { locale, orgSlug, path } = parseScope(formData);
  const ctx = await requireOrgContext(locale, orgSlug);
  await createStage(ctx, {
    cropId: z.string().uuid().parse(formData.get("cropId")),
    name: z.string().min(1).max(160).parse(formData.get("name")),
    orderIndex: str(formData, "orderIndex")
      ? Number(formData.get("orderIndex"))
      : undefined,
    typicalDurationDays: str(formData, "typicalDurationDays")
      ? Number(formData.get("typicalDurationDays"))
      : null,
  });
  revalidatePath(path);
}

export async function deleteStageAction(formData: FormData) {
  const { locale, orgSlug, path } = parseScope(formData);
  const ctx = await requireOrgContext(locale, orgSlug);
  const stageId = z.string().uuid().parse(formData.get("stageId"));
  await deleteStage(ctx, stageId);
  revalidatePath(path);
}
