"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { audit } from "@/lib/audit";
import { requireOrgContext } from "@/lib/tenancy";
import { CURRENCY_CODES } from "@/lib/currency";
import {
  deleteExchangeRate,
  upsertExchangeRate,
} from "@/server/services/exchange-rates";

const scope = z.object({ locale: z.string(), orgSlug: z.string() });

// Positive decimal with up to 8 fraction digits; "0" (and 0.0000…) rejected
// because a zero rate silently wipes activities from base-currency reports.
const rateSchema = z
  .string()
  .regex(/^\d{1,10}(\.\d{1,8})?$/)
  .refine((value) => Number(value) > 0, "rate must be positive");

export async function upsertExchangeRateAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);

  const currencyCode = z
    .enum(CURRENCY_CODES as [string, ...string[]])
    .parse(formData.get("currencyCode"));
  if (currencyCode === ctx.org.baseCurrencyCode) {
    throw new Error("cannot set a rate for the base currency");
  }

  const rateToBase = rateSchema.parse(formData.get("rateToBase"));
  const rate = await upsertExchangeRate(ctx, {
    currencyCode,
    rateToBase,
    validDate: z.string().min(10).parse(formData.get("validDate")),
  });

  await audit(ctx, "exchange_rate.set", {
    entity: "exchange_rate",
    entityId: rate.id,
    meta: { currency: currencyCode, rate: rateToBase },
  });

  revalidatePath(`/${locale}/o/${orgSlug}/settings/currencies`);
}

export async function deleteExchangeRateAction(formData: FormData) {
  const { locale, orgSlug } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
  });
  const ctx = await requireOrgContext(locale, orgSlug);
  const id = z.string().uuid().parse(formData.get("id"));
  await deleteExchangeRate(ctx, id);
  revalidatePath(`/${locale}/o/${orgSlug}/settings/currencies`);
}
