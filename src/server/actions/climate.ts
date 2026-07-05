"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/tenancy";
import {
  deleteClimateReading,
  upsertClimateReading,
} from "@/server/services/climate";

const scope = z.object({ locale: z.string(), orgSlug: z.string() });

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
}

export async function upsertClimateAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const farmId = z.string().uuid().parse(formData.get("farmId"));
  await upsertClimateReading(ctx, {
    farmId,
    date: z.string().min(10).parse(formData.get("date")),
    rainfallMm: str(formData, "rainfallMm") ?? null,
    tempMinC: str(formData, "tempMinC") ?? null,
    tempMaxC: str(formData, "tempMaxC") ?? null,
    humidityPct: str(formData, "humidityPct") ?? null,
  });
  revalidatePath(`/${locale}/o/${orgSlug}/climate`);
}

export async function deleteClimateAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const id = z.string().uuid().parse(formData.get("id"));
  await deleteClimateReading(ctx, id);
  revalidatePath(`/${locale}/o/${orgSlug}/climate`);
}
