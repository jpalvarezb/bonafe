import { and, asc, desc, eq, lte } from "drizzle-orm";
import { db } from "@/lib/db";
import { orgExchangeRates } from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan, ReadOnlyOrgError } from "@/lib/authz";
import { newId } from "@/lib/ids";

export type ExchangeRateInput = {
  currencyCode: string;
  rateToBase: string;
  validDate: string;
};

/** All exchange-rate rows for the org, ordered by currency then most recent first. */
export async function listExchangeRates(ctx: OrgContext) {
  return db
    .select()
    .from(orgExchangeRates)
    .where(eq(orgExchangeRates.orgId, ctx.org.id))
    .orderBy(asc(orgExchangeRates.currencyCode), desc(orgExchangeRates.validDate));
}

/**
 * Rate to multiply an amount in `currencyCode` by to get org base currency,
 * effective on `onDate` (the most recent rate with validDate <= onDate).
 * Returns "1" for the org's own base currency, or null when no rate is configured.
 */
export async function latestRateToBase(
  ctx: OrgContext,
  currencyCode: string,
  onDate: string,
): Promise<string | null> {
  if (currencyCode === ctx.org.baseCurrencyCode) return "1";

  const [row] = await db
    .select({ rateToBase: orgExchangeRates.rateToBase })
    .from(orgExchangeRates)
    .where(
      and(
        eq(orgExchangeRates.orgId, ctx.org.id),
        eq(orgExchangeRates.currencyCode, currencyCode),
        lte(orgExchangeRates.validDate, onDate),
      ),
    )
    .orderBy(desc(orgExchangeRates.validDate))
    .limit(1);

  return row?.rateToBase ?? null;
}

export async function upsertExchangeRate(
  ctx: OrgContext,
  input: ExchangeRateInput,
) {
  assertCan(ctx, "settings", "manage");
  // Exchange rates are business data, not billing controls: even though the
  // "settings" resource stays writable for billing recovery, rate mutations
  // are blocked while the org is in degraded read-only mode.
  if (
    ctx.subscriptionStatus === "past_due" ||
    ctx.subscriptionStatus === "canceled"
  ) {
    throw new ReadOnlyOrgError(ctx.subscriptionStatus);
  }
  const [rate] = await db
    .insert(orgExchangeRates)
    .values({
      id: newId(),
      orgId: ctx.org.id,
      currencyCode: input.currencyCode,
      rateToBase: input.rateToBase,
      validDate: input.validDate,
    })
    .onConflictDoUpdate({
      target: [
        orgExchangeRates.orgId,
        orgExchangeRates.currencyCode,
        orgExchangeRates.validDate,
      ],
      set: {
        rateToBase: input.rateToBase,
      },
    })
    .returning();
  return rate;
}

export async function deleteExchangeRate(ctx: OrgContext, id: string) {
  assertCan(ctx, "settings", "manage");
  // Exchange rates are business data, not billing controls: even though the
  // "settings" resource stays writable for billing recovery, rate mutations
  // are blocked while the org is in degraded read-only mode.
  if (
    ctx.subscriptionStatus === "past_due" ||
    ctx.subscriptionStatus === "canceled"
  ) {
    throw new ReadOnlyOrgError(ctx.subscriptionStatus);
  }
  await db
    .delete(orgExchangeRates)
    .where(
      and(eq(orgExchangeRates.id, id), eq(orgExchangeRates.orgId, ctx.org.id)),
    );
}
