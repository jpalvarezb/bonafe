"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/tenancy";
import {
  addHarvestsToLot,
  closeLot,
  createLot,
  createRun,
  deleteRun,
  removeHarvestFromLot,
} from "@/server/services/processing";

const scope = z.object({ locale: z.string(), orgSlug: z.string() });

// Quantities and cost travel as strings and are re-validated here before the
// service hands them to the numeric(…) columns.
const quantityString = z.string().regex(/^\d{1,12}(\.\d{1,8})?$/);
const costString = z.string().regex(/^\d{1,12}(\.\d{1,8})?$/).default("0");

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
}

// ---------------------------------------------------------------------------
// Harvest lots
// ---------------------------------------------------------------------------

export async function createLotAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const cropCycleId = z.string().uuid().parse(formData.get("cropCycleId"));
  const name = z.string().min(1).parse(formData.get("name"));
  const notes = str(formData, "notes") ?? null;
  const lot = await createLot(ctx, { cropCycleId, name, notes });
  revalidatePath(`/${locale}/o/${orgSlug}/processing/lots`);
  revalidatePath(`/${locale}/o/${orgSlug}/processing/lots/${lot.id}`);
}

export async function addHarvestsToLotAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const lotId = z.string().uuid().parse(formData.get("lotId"));
  const harvestIds = z
    .array(z.string().uuid())
    .parse(formData.getAll("harvestIds"));
  await addHarvestsToLot(ctx, lotId, harvestIds);
  revalidatePath(`/${locale}/o/${orgSlug}/processing/lots/${lotId}`);
}

export async function removeHarvestFromLotAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const lotId = z.string().uuid().parse(formData.get("lotId"));
  const harvestId = z.string().uuid().parse(formData.get("harvestId"));
  await removeHarvestFromLot(ctx, lotId, harvestId);
  revalidatePath(`/${locale}/o/${orgSlug}/processing/lots/${lotId}`);
}

export async function closeLotAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const lotId = z.string().uuid().parse(formData.get("lotId"));
  await closeLot(ctx, lotId);
  revalidatePath(`/${locale}/o/${orgSlug}/processing/lots/${lotId}`);
  revalidatePath(`/${locale}/o/${orgSlug}/processing/lots`);
}

// ---------------------------------------------------------------------------
// Processing runs
// ---------------------------------------------------------------------------

export async function createRunAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const cropCycleId = z.string().uuid().parse(formData.get("cropCycleId"));
  const harvestLotIdRaw = str(formData, "harvestLotId");
  const harvestLotId = harvestLotIdRaw
    ? z.string().uuid().parse(harvestLotIdRaw)
    : null;
  const date = z.string().min(10).parse(formData.get("date"));
  const inputQuantity = quantityString.parse(formData.get("inputQuantity"));
  const inputUnit = z.string().min(1).parse(formData.get("inputUnit"));
  const outputQuantity = quantityString.parse(formData.get("outputQuantity"));
  const outputUnit = z.string().min(1).parse(formData.get("outputUnit"));
  const cost = costString.parse(str(formData, "cost") ?? "0");
  const notes = str(formData, "notes") ?? null;

  await createRun(ctx, {
    cropCycleId,
    harvestLotId,
    date,
    inputQuantity,
    inputUnit,
    outputQuantity,
    outputUnit,
    cost,
    notes,
  });
  revalidatePath(`/${locale}/o/${orgSlug}/processing`);
}

export async function deleteRunAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const id = z.string().uuid().parse(formData.get("id"));
  await deleteRun(ctx, id);
  revalidatePath(`/${locale}/o/${orgSlug}/processing`);
}
