"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/tenancy";
import {
  cancelPlannedActivity,
  convertPlannedActivity,
  createPlannedActivity,
} from "@/server/services/planning";

const scope = z.object({ locale: z.string(), orgSlug: z.string() });

// Non-negative decimals only, mirrors purchases/inventory actions.
const estimatedCostSchema = z.string().regex(/^\d{1,12}(\.\d{1,8})?$/);

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
}

export async function createPlannedActivityAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);

  const rawEstimatedCost = str(formData, "estimatedCost");

  await createPlannedActivity(ctx, {
    activityTypeId: z.string().uuid().parse(formData.get("activityTypeId")),
    plannedDate: z.string().min(10).parse(formData.get("plannedDate")),
    parcelId: str(formData, "parcelId") ?? null,
    cropCycleId: str(formData, "cropCycleId") ?? null,
    description: str(formData, "description") ?? null,
    estimatedCost: rawEstimatedCost
      ? estimatedCostSchema.parse(rawEstimatedCost)
      : undefined,
  });

  revalidatePath(`/${locale}/o/${orgSlug}/planning`);
}

export async function convertPlannedActivityAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const id = z.string().uuid().parse(formData.get("id"));
  await convertPlannedActivity(ctx, id);
  revalidatePath(`/${locale}/o/${orgSlug}/planning`);
}

export async function cancelPlannedActivityAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const id = z.string().uuid().parse(formData.get("id"));
  await cancelPlannedActivity(ctx, id);
  revalidatePath(`/${locale}/o/${orgSlug}/planning`);
}
