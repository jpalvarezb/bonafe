"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/tenancy";
import {
  createWorker,
  setWorkerActive,
  updateWorker,
} from "@/server/services/workers";

const scope = z.object({ locale: z.string(), orgSlug: z.string() });

// Up to 10 integer digits, up to 4 decimals; rejects negatives and junk input.
const rateRegex = /^\d{1,10}(\.\d{1,4})?$/;
const rateSchema = z.string().regex(rateRegex).optional();

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
}

const workerSchema = z.object({
  name: z.string().min(1).max(160),
  code: z.string().max(60).optional(),
  documentId: z.string().max(60).optional(),
  phone: z.string().max(40).optional(),
  type: z.enum(["fixed", "temporary"]),
  dailyRate: rateSchema,
  hourlyRate: rateSchema,
  notes: z.string().max(2000).optional(),
});

export async function createWorkerAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const input = workerSchema.parse({
    name: formData.get("name"),
    code: str(formData, "code"),
    documentId: str(formData, "documentId"),
    phone: str(formData, "phone"),
    type: formData.get("type") ?? "temporary",
    dailyRate: str(formData, "dailyRate"),
    hourlyRate: str(formData, "hourlyRate"),
    notes: str(formData, "notes"),
  });
  await createWorker(ctx, input);
  redirect(`/${locale}/o/${orgSlug}/workers`);
}

export async function updateWorkerAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const workerId = z.string().uuid().parse(formData.get("workerId"));
  const input = workerSchema.partial().parse({
    name: str(formData, "name"),
    code: str(formData, "code"),
    documentId: str(formData, "documentId"),
    phone: str(formData, "phone"),
    type: str(formData, "type"),
    dailyRate: str(formData, "dailyRate"),
    hourlyRate: str(formData, "hourlyRate"),
    notes: str(formData, "notes"),
  });
  await updateWorker(ctx, workerId, input);
  redirect(`/${locale}/o/${orgSlug}/workers`);
}

export async function setWorkerActiveAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const workerId = z.string().uuid().parse(formData.get("workerId"));
  const active = formData.get("active") === "true";
  await setWorkerActive(ctx, workerId, active);
  revalidatePath(`/${locale}/o/${orgSlug}/workers`);
}
