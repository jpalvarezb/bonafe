"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/tenancy";
import {
  createMachine,
  createUsageLog,
  deleteUsageLog,
  setMachineActive,
  updateMachine,
} from "@/server/services/machinery";

const scope = z.object({ locale: z.string(), orgSlug: z.string() });

// Rejects negatives/junk; scales match the numeric columns so JS-computed
// totals equal what Postgres stores (money numeric(14,4); hours/liters (_,2)).
const moneyRegex = /^\d{1,12}(\.\d{1,4})?$/;
const moneySchema = z.string().regex(moneyRegex);
const moneyOptional = moneySchema.optional();
const twoDecimalSchema = z.string().regex(/^\d{1,10}(\.\d{1,2})?$/);

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
}

const machineSchema = z.object({
  name: z.string().min(1).max(160),
  code: z.string().max(60).optional(),
  category: z.string().max(60).optional(),
  brand: z.string().max(60).optional(),
  model: z.string().max(60).optional(),
  year: z.coerce.number().int().min(1900).max(2100).optional(),
  hourlyCost: moneyOptional,
  notes: z.string().max(2000).optional(),
});

export async function createMachineAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const input = machineSchema.parse({
    name: formData.get("name"),
    code: str(formData, "code"),
    category: str(formData, "category"),
    brand: str(formData, "brand"),
    model: str(formData, "model"),
    year: str(formData, "year"),
    hourlyCost: str(formData, "hourlyCost"),
    notes: str(formData, "notes"),
  });
  await createMachine(ctx, input);
  redirect(`/${locale}/o/${orgSlug}/machinery`);
}

export async function updateMachineAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const machineId = z.string().uuid().parse(formData.get("machineId"));
  const input = machineSchema.partial().parse({
    name: str(formData, "name"),
    code: str(formData, "code"),
    category: str(formData, "category"),
    brand: str(formData, "brand"),
    model: str(formData, "model"),
    year: str(formData, "year"),
    hourlyCost: str(formData, "hourlyCost"),
    notes: str(formData, "notes"),
  });
  await updateMachine(ctx, machineId, input);
  redirect(`/${locale}/o/${orgSlug}/machinery`);
}

export async function setMachineActiveAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const machineId = z.string().uuid().parse(formData.get("machineId"));
  const active = formData.get("active") === "true";
  await setMachineActive(ctx, machineId, active);
  revalidatePath(`/${locale}/o/${orgSlug}/machinery`);
  revalidatePath(`/${locale}/o/${orgSlug}/machinery/${machineId}`);
}

const usageLogSchema = z.object({
  machineId: z.string().uuid(),
  date: z.string().min(1),
  hoursUsed: twoDecimalSchema,
  fuelLiters: twoDecimalSchema.optional(),
  fuelCost: moneyOptional,
  activityId: z.string().uuid().optional(),
  workOrderId: z.string().uuid().optional(),
  operatorWorkerId: z.string().uuid().optional(),
  notes: z.string().max(2000).optional(),
});

export async function createUsageLogAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const input = usageLogSchema.parse({
    machineId: formData.get("machineId"),
    date: formData.get("date"),
    hoursUsed: formData.get("hoursUsed"),
    fuelLiters: str(formData, "fuelLiters"),
    fuelCost: str(formData, "fuelCost"),
    activityId: str(formData, "activityId"),
    workOrderId: str(formData, "workOrderId"),
    operatorWorkerId: str(formData, "operatorWorkerId"),
    notes: str(formData, "notes"),
  });
  await createUsageLog(ctx, input);
  revalidatePath(`/${locale}/o/${orgSlug}/machinery/${input.machineId}`);
}

export async function deleteUsageLogAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const logId = z.string().uuid().parse(formData.get("logId"));
  const machineId = z.string().uuid().parse(formData.get("machineId"));
  await deleteUsageLog(ctx, logId);
  revalidatePath(`/${locale}/o/${orgSlug}/machinery/${machineId}`);
}
