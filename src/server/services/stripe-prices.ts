import type Stripe from "stripe";
import { buildPriceLookupKey } from "@/lib/plan-pricing";
import type { BillablePlanId } from "@/lib/stripe";
import { getPlanPriceId } from "@/lib/stripe";

/**
 * Resolves (creating on first use) the Stripe Price for a plan denominated
 * in a local currency. No DB table backs this — the deterministic
 * lookup_key (buildPriceLookupKey) IS the cache: `prices.list` by
 * lookup_key finds a previously created Price before falling back to
 * `prices.create`.
 *
 * The new Price is attached to the SAME Stripe Product as the plan's USD
 * price (fetched via the existing STRIPE_PRICE_* env id) so the Product
 * catalog stays a single source of truth per plan.
 */
export async function getOrCreateLocalPrice(
  stripe: Stripe,
  planId: BillablePlanId,
  currency: string,
  unitAmountMinor: number,
): Promise<Stripe.Price | null> {
  const usdPriceId = getPlanPriceId(planId);
  if (!usdPriceId) return null;

  const lookupKey = buildPriceLookupKey(planId, currency);

  const existing = await stripe.prices.list({
    lookup_keys: [lookupKey],
    limit: 1,
  });
  if (existing.data[0]) return existing.data[0];

  const usdPrice = await stripe.prices.retrieve(usdPriceId);
  const product =
    typeof usdPrice.product === "string"
      ? usdPrice.product
      : usdPrice.product.id;

  return stripe.prices.create({
    currency: currency.toLowerCase(),
    unit_amount: unitAmountMinor,
    recurring: { interval: "month" },
    lookup_key: lookupKey,
    product,
    metadata: { planId, source: "agropeq-fx" },
  });
}
