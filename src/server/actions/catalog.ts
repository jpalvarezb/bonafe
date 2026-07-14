"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/tenancy";
import {
  createActivityType,
  createCrop,
  createProduct,
  createVariety,
} from "@/server/services/catalog";

const scope = z.object({
  locale: z.string(),
  orgSlug: z.string(),
  path: z.string(),
});

function parseScope(formData: FormData) {
  return scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
    path: formData.get("path"),
  });
}

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
}

export async function createCropAction(formData: FormData) {
  const { locale, orgSlug, path } = parseScope(formData);
  const ctx = await requireOrgContext(locale, orgSlug);
  await createCrop(ctx, {
    name: z.string().min(1).parse(formData.get("name")),
    scientificName: str(formData, "scientificName"),
    defaultCycleDays: str(formData, "defaultCycleDays")
      ? Number(formData.get("defaultCycleDays"))
      : undefined,
  });
  revalidatePath(path);
}

export async function createVarietyAction(formData: FormData) {
  const { locale, orgSlug, path } = parseScope(formData);
  const ctx = await requireOrgContext(locale, orgSlug);
  await createVariety(ctx, {
    cropId: z.string().uuid().parse(formData.get("cropId")),
    name: z.string().min(1).parse(formData.get("name")),
  });
  revalidatePath(path);
}

export async function createProductAction(formData: FormData) {
  const { locale, orgSlug, path } = parseScope(formData);
  const ctx = await requireOrgContext(locale, orgSlug);
  await createProduct(ctx, {
    name: z.string().min(1).parse(formData.get("name")),
    category: z
      .enum(["fertilizer", "agrochemical", "seed", "tool", "fuel", "other"])
      .parse(formData.get("category") ?? "other"),
    unit: str(formData, "unit"),
    activeIngredient: str(formData, "activeIngredient"),
    minStock: str(formData, "minStock")
      ? z
          .string()
          .regex(/^\d+(\.\d+)?$/)
          .parse(str(formData, "minStock"))
      : undefined,
  });
  revalidatePath(path);
}

export async function createActivityTypeAction(formData: FormData) {
  const { locale, orgSlug, path } = parseScope(formData);
  const ctx = await requireOrgContext(locale, orgSlug);
  await createActivityType(ctx, {
    name: z.string().min(1).parse(formData.get("name")),
  });
  revalidatePath(path);
}
