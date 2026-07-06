"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireOrgContext } from "@/lib/tenancy";
import { createPurchase, deletePurchase } from "@/server/services/purchases";

const scope = z.object({ locale: z.string(), orgSlug: z.string() });

// Non-negative decimals only: a crafted payload with negative quantities
// would corrupt stock/valuation (negative purchase = phantom outbound).
const positiveDecimal = z.string().regex(/^\d{1,12}(\.\d{1,8})?$/);

const lineSchema = z.object({
  productId: z.string().uuid(),
  quantity: positiveDecimal,
  unitCost: positiveDecimal,
});

const purchaseSchema = z.object({
  supplierId: z.string().uuid(),
  date: z.string().min(10),
  invoiceNumber: z.string().optional(),
  currencyCode: z.string().length(3).optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});

export async function createPurchaseAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);

  const payload = purchaseSchema.parse(
    JSON.parse(z.string().parse(formData.get("payload"))),
  );

  const created = await createPurchase(ctx, {
    supplierId: payload.supplierId,
    date: payload.date,
    invoiceNumber: payload.invoiceNumber || null,
    currencyCode: payload.currencyCode,
    notes: payload.notes || null,
    lines: payload.lines,
  });

  await audit(ctx, "purchase.create", {
    entity: "purchase",
    entityId: created.id,
    meta: { total: created.total, currency: created.currencyCode },
  });

  redirect(`/${locale}/o/${orgSlug}/purchases/${created.id}`);
}

export async function deletePurchaseAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const purchaseId = z.string().uuid().parse(formData.get("purchaseId"));
  await deletePurchase(ctx, purchaseId);
  await audit(ctx, "purchase.delete", {
    entity: "purchase",
    entityId: purchaseId,
  });
  redirect(`/${locale}/o/${orgSlug}/purchases`);
}
