"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { requireOrgContext } from "@/lib/tenancy";
import {
  createPieceRate,
  createPieceworkEntry,
  deletePieceworkEntry,
  setPieceRateActive,
} from "@/server/services/piecework";

const scope = z.object({ locale: z.string(), orgSlug: z.string() });

// Up to 12 integer digits, up to 8 decimals — quantity and rate per the
// piecework money spec (columns themselves are numeric(14,4)).
const moneyRegex = /^\d{1,12}(\.\d{1,8})?$/;
const moneySchema = z.string().regex(moneyRegex);

function str(formData: FormData, key: string): string | undefined {
  const value = formData.get(key);
  return typeof value === "string" && value !== "" ? value : undefined;
}

const pieceRateSchema = z.object({
  name: z.string().min(1).max(160),
  unit: z.string().min(1).max(40),
  rate: moneySchema,
});

export async function createPieceRateAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const input = pieceRateSchema.parse({
    name: formData.get("name"),
    unit: formData.get("unit"),
    rate: formData.get("rate"),
  });
  await createPieceRate(ctx, input);
  revalidatePath(`/${locale}/o/${orgSlug}/piecework`);
}

export async function setPieceRateActiveAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const pieceRateId = z.string().uuid().parse(formData.get("pieceRateId"));
  const active = formData.get("active") === "true";
  await setPieceRateActive(ctx, pieceRateId, active);
  revalidatePath(`/${locale}/o/${orgSlug}/piecework`);
}

const pieceworkEntrySchema = z.object({
  workerId: z.string().uuid(),
  pieceRateId: z.string().uuid(),
  cropCycleId: z.string().uuid().optional(),
  date: z.string().min(10).max(10),
  quantity: moneySchema,
  notes: z.string().max(2000).optional(),
});

export async function createPieceworkEntryAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const input = pieceworkEntrySchema.parse({
    workerId: formData.get("workerId"),
    pieceRateId: formData.get("pieceRateId"),
    cropCycleId: str(formData, "cropCycleId"),
    date: formData.get("date"),
    quantity: formData.get("quantity"),
    notes: str(formData, "notes"),
  });
  await createPieceworkEntry(ctx, input);
  revalidatePath(`/${locale}/o/${orgSlug}/piecework`);
}

export async function deletePieceworkEntryAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const entryId = z.string().uuid().parse(formData.get("entryId"));
  await deletePieceworkEntry(ctx, entryId);
  revalidatePath(`/${locale}/o/${orgSlug}/piecework`);
}
