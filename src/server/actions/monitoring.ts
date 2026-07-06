"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrgContext } from "@/lib/tenancy";
import {
  createMonitoringRecord,
  deleteMonitoringRecord,
} from "@/server/services/monitoring";

const scope = z.object({ locale: z.string(), orgSlug: z.string() });

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
}

export async function createMonitoringAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  await createMonitoringRecord(ctx, {
    parcelId: z.string().uuid().parse(formData.get("parcelId")),
    cropCycleId: str(formData, "cropCycleId") ?? null,
    date: z.string().min(10).parse(formData.get("date")),
    type: z.enum(["pest", "disease", "weed"]).parse(formData.get("type")),
    agentName: z.string().min(1).parse(formData.get("agentName")),
    severity: z.coerce.number().int().min(1).max(5).parse(formData.get("severity")),
    incidencePct: z
      .string()
      .refine((v) => /^\d+(\.\d+)?$/.test(v) && Number(v) <= 100, {
        message: "must be between 0 and 100",
      })
      .nullable()
      .parse(str(formData, "incidencePct") ?? null),
    notes: str(formData, "notes") ?? null,
    actionsTaken: str(formData, "actionsTaken") ?? null,
  });
  redirect(`/${locale}/o/${orgSlug}/monitoring`);
}

export async function deleteMonitoringAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const id = z.string().uuid().parse(formData.get("id"));
  await deleteMonitoringRecord(ctx, id);
  revalidatePath(`/${locale}/o/${orgSlug}/monitoring`);
}
