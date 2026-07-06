"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/tenancy";
import {
  closePayrollPeriod,
  createPayrollPeriod,
  generatePayrollEntries,
  updatePayrollEntryAdjustments,
} from "@/server/services/payroll";

const scope = z.object({ locale: z.string(), orgSlug: z.string() });

// Money fields travel as strings and are re-validated here before the
// service recomputes the entry's net via the calc module.
const moneyString = z
  .string()
  .regex(/^\d{1,12}(\.\d{1,4})?$/)
  .default("0");

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
}

const periodInputSchema = z
  .object({
    name: z.string().min(1),
    startDate: z.string().min(10),
    endDate: z.string().min(10),
  })
  .refine((value) => value.startDate <= value.endDate, {
    message: "startDate must not be after endDate",
    path: ["endDate"],
  });

export async function createPayrollPeriodAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const input = periodInputSchema.parse({
    name: formData.get("name"),
    startDate: formData.get("startDate"),
    endDate: formData.get("endDate"),
  });
  await createPayrollPeriod(ctx, input);
  revalidatePath(`/${locale}/o/${orgSlug}/payroll`);
}

export async function generatePayrollEntriesAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const periodId = z.string().uuid().parse(formData.get("periodId"));
  await generatePayrollEntries(ctx, periodId);
  revalidatePath(`/${locale}/o/${orgSlug}/payroll/${periodId}`);
}

export async function updatePayrollEntryAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const periodId = z.string().uuid().parse(formData.get("periodId"));
  const entryId = z.string().uuid().parse(formData.get("entryId"));
  const bonuses = moneyString.parse(str(formData, "bonuses") ?? "0");
  const deductions = moneyString.parse(str(formData, "deductions") ?? "0");
  const notes = str(formData, "notes") ?? null;
  await updatePayrollEntryAdjustments(ctx, periodId, entryId, {
    bonuses,
    deductions,
    notes,
  });
  revalidatePath(`/${locale}/o/${orgSlug}/payroll/${periodId}`);
}

export async function closePayrollPeriodAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const periodId = z.string().uuid().parse(formData.get("periodId"));
  await closePayrollPeriod(ctx, periodId);
  revalidatePath(`/${locale}/o/${orgSlug}/payroll/${periodId}`);
  revalidatePath(`/${locale}/o/${orgSlug}/payroll`);
}
