"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireOrgContext } from "@/lib/tenancy";
import { assertCanAddFarm, PlanLimitError } from "@/lib/plan-limits";
import {
  createFarm,
  setFarmActive,
  updateFarm,
} from "@/server/services/farms";
import {
  createParcel,
  parcelAttributesSchema,
  setParcelActive,
  updateParcel,
} from "@/server/services/parcels";
import type { GeoJsonPolygon } from "@/lib/db/geometry";

const scope = z.object({
  locale: z.string(),
  orgSlug: z.string(),
});

const farmSchema = z.object({
  name: z.string().min(1).max(160),
  areaHa: z.string().optional(),
  notes: z.string().optional(),
});

const boundarySchema = z
  .object({
    type: z.literal("Polygon"),
    coordinates: z.array(z.array(z.array(z.number()).length(2))).min(1),
  })
  .nullable();

const parcelSchema = z.object({
  farmId: z.string().uuid(),
  name: z.string().min(1).max(160),
  code: z.string().optional(),
  soilType: z.string().optional(),
  areaHa: z.string().optional(),
  boundary: z
    .string()
    .optional()
    .transform((raw) => (raw ? (JSON.parse(raw) as unknown) : null))
    .pipe(boundarySchema),
  attributes: z
    .string()
    .optional()
    .transform((raw) => (raw ? (JSON.parse(raw) as unknown) : {}))
    .pipe(parcelAttributesSchema),
});

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
}

export async function createFarmAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  try {
    await assertCanAddFarm(ctx.org.id);
  } catch (e) {
    if (e instanceof PlanLimitError) {
      redirect(`/${locale}/o/${orgSlug}/settings/plan?limit=maxFarms`);
    }
    throw e;
  }
  const input = farmSchema.parse({
    name: formData.get("name"),
    areaHa: str(formData, "areaHa"),
    notes: str(formData, "notes"),
  });
  const farm = await createFarm(ctx, input);
  redirect(`/${locale}/o/${orgSlug}/farms/${farm.id}`);
}

export async function updateFarmAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const farmId = z.string().uuid().parse(formData.get("farmId"));
  const input = farmSchema.partial().parse({
    name: str(formData, "name"),
    areaHa: str(formData, "areaHa"),
    notes: str(formData, "notes"),
  });
  await updateFarm(ctx, farmId, input);
  revalidatePath(`/${locale}/o/${orgSlug}/farms/${farmId}`);
}

export async function setFarmActiveAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const farmId = z.string().uuid().parse(formData.get("farmId"));
  const active = formData.get("active") === "true";
  await setFarmActive(ctx, farmId, active);
  await audit(ctx, "farm.set_active", {
    entity: "farm",
    entityId: farmId,
    meta: { active },
  });
  revalidatePath(`/${locale}/o/${orgSlug}/farms`);
  revalidatePath(`/${locale}/o/${orgSlug}/farms/${farmId}`);
}

export async function createParcelAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const input = parcelSchema.parse({
    farmId: formData.get("farmId"),
    name: formData.get("name"),
    code: str(formData, "code"),
    soilType: str(formData, "soilType"),
    areaHa: str(formData, "areaHa"),
    boundary: str(formData, "boundary"),
    attributes: str(formData, "attributes"),
  });
  await createParcel(ctx, {
    ...input,
    boundary: input.boundary as GeoJsonPolygon | null,
  });
  redirect(`/${locale}/o/${orgSlug}/farms/${input.farmId}`);
}

export async function updateParcelAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const parcelId = z.string().uuid().parse(formData.get("parcelId"));
  const farmId = z.string().uuid().parse(formData.get("farmId"));
  const input = parcelSchema.partial().parse({
    name: str(formData, "name"),
    code: str(formData, "code"),
    soilType: str(formData, "soilType"),
    areaHa: str(formData, "areaHa"),
    boundary: str(formData, "boundary"),
    attributes: str(formData, "attributes"),
  });
  await updateParcel(ctx, parcelId, {
    ...input,
    boundary: input.boundary as GeoJsonPolygon | null | undefined,
  });
  revalidatePath(`/${locale}/o/${orgSlug}/farms/${farmId}`);
}

export async function setParcelActiveAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const parcelId = z.string().uuid().parse(formData.get("parcelId"));
  const farmId = z.string().uuid().parse(formData.get("farmId"));
  const active = formData.get("active") === "true";
  await setParcelActive(ctx, parcelId, active);
  await audit(ctx, "parcel.set_active", {
    entity: "parcel",
    entityId: parcelId,
    meta: { active },
  });
  revalidatePath(`/${locale}/o/${orgSlug}/farms/${farmId}`);
}
