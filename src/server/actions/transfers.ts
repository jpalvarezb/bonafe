"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { requireOrgContext } from "@/lib/tenancy";
import { createTransfer } from "@/server/services/transfers";

const scope = z.object({ locale: z.string(), orgSlug: z.string() });

// Non-negative decimals only: a crafted payload with negative quantities
// would corrupt stock at both warehouses (same guard as purchases lines).
const positiveDecimal = z.string().regex(/^\d{1,12}(\.\d{1,8})?$/);

const lineSchema = z.object({
  productId: z.string().uuid(),
  quantity: positiveDecimal,
});

const transferSchema = z.object({
  fromWarehouseId: z.string().uuid(),
  toWarehouseId: z.string().uuid(),
  date: z.string().min(10),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});

// Maps service-thrown validation errors to translated keys under
// warehouses.transfers.errors — there's no error boundary in this app, so
// the create action redirects back to the form with ?error=<key> instead of
// letting the error crash the request (the form page renders the message).
const ERROR_KEYS: Record<string, string> = {
  "insufficient stock": "insufficientStock",
  "source and destination warehouses must differ": "sameWarehouse",
  "warehouse not found": "notFound",
  "product not found": "notFound",
};

export async function createTransferAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);

  const payload = transferSchema.parse(
    JSON.parse(z.string().parse(formData.get("payload"))),
  );

  try {
    await createTransfer(ctx, {
      fromWarehouseId: payload.fromWarehouseId,
      toWarehouseId: payload.toWarehouseId,
      date: payload.date,
      notes: payload.notes || null,
      lines: payload.lines,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "";
    const key = ERROR_KEYS[message] ?? "unknown";
    redirect(`/${locale}/o/${orgSlug}/warehouses/transfers/new?error=${key}`);
  }

  revalidatePath(`/${locale}/o/${orgSlug}/warehouses`);
  redirect(`/${locale}/o/${orgSlug}/warehouses`);
}
