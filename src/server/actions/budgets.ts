"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/tenancy";
import {
  createBudget,
  deleteBudget,
  upsertBudgetLine,
} from "@/server/services/budgets";

const scope = z.object({ locale: z.string(), orgSlug: z.string() });

// Mirrors BudgetCategory from @/lib/calc/variance (kept as a literal zod
// enum here so the parsed value narrows without a cast).
const categorySchema = z.enum(["labor", "input", "machine", "other"]);

// Money fields travel as strings and are re-validated here before the
// service writes them; no negatives, up to 12 integer + 8 fractional digits.
const moneyString = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,8})?$/)
  .default("0");

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
}

const budgetInputSchema = z.object({
  name: z.string().min(1),
  year: z.coerce.number().int().min(2000).max(2100),
  farmId: z.string().uuid().nullish(),
  cropCycleId: z.string().uuid().nullish(),
});

export async function createBudgetAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const input = budgetInputSchema.parse({
    name: formData.get("name"),
    year: formData.get("year"),
    farmId: str(formData, "farmId") ?? null,
    cropCycleId: str(formData, "cropCycleId") ?? null,
  });
  await createBudget(ctx, input);
  revalidatePath(`/${locale}/o/${orgSlug}/budgets`);
}

export async function deleteBudgetAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const id = z.string().uuid().parse(formData.get("id"));
  await deleteBudget(ctx, id);
  revalidatePath(`/${locale}/o/${orgSlug}/budgets`);
}

export async function upsertBudgetLineAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const budgetId = z.string().uuid().parse(formData.get("budgetId"));
  const month = z.coerce.number().int().min(1).max(12).parse(formData.get("month"));
  const category = categorySchema.parse(formData.get("category"));
  const amount = moneyString.parse(str(formData, "amount") ?? "0");
  await upsertBudgetLine(ctx, budgetId, month, category, amount);
  revalidatePath(`/${locale}/o/${orgSlug}/budgets/${budgetId}`);
}
