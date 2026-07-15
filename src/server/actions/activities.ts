"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrgContext } from "@/lib/tenancy";
import {
  createActivity,
  deleteActivity,
} from "@/server/services/activities";

const scope = z.object({ locale: z.string(), orgSlug: z.string() });

const inputLineSchema = z.object({
  productId: z.string().uuid(),
  quantity: z.string().min(1),
  // Empty/omitted: server derives it from the default warehouse's WAC
  // (see createActivityInTx) instead of requiring re-typed free text.
  unitCost: z.string().optional(),
});

const laborLineSchema = z.object({
  workerId: z.string().uuid().optional(),
  workerName: z.string().optional(),
  workersCount: z.coerce.number().int().min(1),
  hours: z.string().optional(),
  /** Piecework units; only meaningful when rateType is "piecework". */
  quantity: z.string().optional(),
  rateType: z.enum(["daily", "hourly", "piecework"]),
  rate: z.string().min(1),
});

const activitySchema = z.object({
  parcelId: z.string().uuid().optional(),
  cropCycleId: z.string().uuid().optional(),
  costCenterId: z.string().uuid().optional(),
  activityTypeId: z.string().uuid(),
  date: z.string().min(10),
  description: z.string().optional(),
  otherCost: z.string().optional(),
  currencyCode: z.string().length(3).optional(),
  inputs: z.array(inputLineSchema),
  labor: z.array(laborLineSchema),
});

export async function createActivityAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);

  const payload = activitySchema.parse(
    JSON.parse(z.string().parse(formData.get("payload"))),
  );

  await createActivity(ctx, {
    parcelId: payload.parcelId ?? null,
    cropCycleId: payload.cropCycleId ?? null,
    costCenterId: payload.costCenterId ?? null,
    activityTypeId: payload.activityTypeId,
    date: payload.date,
    description: payload.description ?? null,
    otherCost: payload.otherCost,
    currencyCode: payload.currencyCode,
    inputs: payload.inputs.map((line) => ({
      ...line,
      unitCost: line.unitCost || undefined,
    })),
    labor: payload.labor.map((line) => ({
      ...line,
      workerId: line.workerId || undefined,
      hours: line.hours || null,
      quantity: line.quantity || undefined,
    })),
  });

  redirect(`/${locale}/o/${orgSlug}/activities`);
}

export async function deleteActivityAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const activityId = z.string().uuid().parse(formData.get("activityId"));
  await deleteActivity(ctx, activityId);
  revalidatePath(`/${locale}/o/${orgSlug}/activities`);
}
