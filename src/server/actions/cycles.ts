"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrgContext } from "@/lib/tenancy";
import {
  closeCycle,
  createCycle,
  setCycleStage,
} from "@/server/services/cycles";

const scope = z.object({ locale: z.string(), orgSlug: z.string() });

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
}

export async function createCycleAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  await createCycle(ctx, {
    parcelId: z.string().uuid().parse(formData.get("parcelId")),
    cropId: z.string().uuid().parse(formData.get("cropId")),
    varietyId: str(formData, "varietyId") ?? null,
    name: z.string().min(1).parse(formData.get("name")),
    startDate: z.string().min(10).parse(formData.get("startDate")),
    expectedEndDate: str(formData, "expectedEndDate") ?? null,
    plantedAreaHa: str(formData, "plantedAreaHa") ?? null,
    plantCount: str(formData, "plantCount")
      ? Number(formData.get("plantCount"))
      : null,
  });
  redirect(`/${locale}/o/${orgSlug}/cycles`);
}

export async function closeCycleAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const cycleId = z.string().uuid().parse(formData.get("cycleId"));
  const endDate = z.string().min(10).parse(formData.get("endDate"));
  await closeCycle(ctx, cycleId, endDate);
  revalidatePath(`/${locale}/o/${orgSlug}/cycles`);
}

export async function setCycleStageAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const cycleId = z.string().uuid().parse(formData.get("cycleId"));
  const stageId = str(formData, "stageId") ?? null;
  await setCycleStage(ctx, cycleId, stageId ? z.string().uuid().parse(stageId) : null);
  revalidatePath(`/${locale}/o/${orgSlug}/cycles`);
}
