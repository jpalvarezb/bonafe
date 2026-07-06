"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireOrgContext } from "@/lib/tenancy";
import { createSale, deleteSale } from "@/server/services/sales";

const scope = z.object({ locale: z.string(), orgSlug: z.string() });

// Non-negative decimals only: a crafted payload with negative quantities or
// prices would corrupt income totals (negative sale = phantom refund).
const positiveDecimal = z.string().regex(/^\d{1,12}(\.\d{1,8})?$/);

const lineSchema = z.object({
  description: z.string().min(1),
  quantity: positiveDecimal,
  unit: z.string().min(1),
  unitPrice: positiveDecimal,
});

const saleSchema = z.object({
  cropCycleId: z.string().uuid().optional(),
  date: z.string().min(10),
  buyerName: z.string().min(1),
  invoiceNumber: z.string().optional(),
  currencyCode: z.string().length(3).optional(),
  notes: z.string().optional(),
  lines: z.array(lineSchema).min(1),
});

export async function createSaleAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);

  const payload = saleSchema.parse(
    JSON.parse(z.string().parse(formData.get("payload"))),
  );

  const created = await createSale(ctx, {
    cropCycleId: payload.cropCycleId || null,
    date: payload.date,
    buyerName: payload.buyerName,
    invoiceNumber: payload.invoiceNumber || null,
    currencyCode: payload.currencyCode,
    notes: payload.notes || null,
    lines: payload.lines,
  });

  await audit(ctx, "sale.create", {
    entity: "sale",
    entityId: created.id,
    meta: {
      buyer: created.buyerName,
      total: created.total,
      currency: created.currencyCode,
    },
  });

  redirect(`/${locale}/o/${orgSlug}/sales/${created.id}`);
}

export async function deleteSaleAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const saleId = z.string().uuid().parse(formData.get("saleId"));
  await deleteSale(ctx, saleId);
  await audit(ctx, "sale.delete", { entity: "sale", entityId: saleId });
  redirect(`/${locale}/o/${orgSlug}/sales`);
}
