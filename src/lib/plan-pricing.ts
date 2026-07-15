import Decimal from "decimal.js";

/**
 * Pure conversion/rounding helpers for local-currency Stripe checkout.
 * Money values travel as strings; Decimal for all math (never float) —
 * same convention as src/lib/calc/costs.ts.
 *
 * ROUNDING POLICY (documented here, implemented in roundToCleanLocalPrice):
 * the USD monthly price is converted to the org's local currency at the
 * latest USD->local exchange rate, then rounded UP (ceiling — equivalent to
 * Decimal.ROUND_UP for these always-positive amounts) to a clean
 * psychological price:
 *   - nearest 10 local-currency units, when the converted amount is below
 *     10,000
 *   - nearest 100 local-currency units, when the converted amount is
 *     >= 10,000
 * Rounding is always UP, never down or to-nearest, so an org is never
 * charged less than the equivalent USD price because of rounding.
 */

/** Base currencies whose orgs see checkout denominated in their own currency. */
export const LOCAL_CHECKOUT_CURRENCIES = ["NIO", "GTQ", "HNL", "CRC"] as const;

export type LocalCheckoutCurrency = (typeof LOCAL_CHECKOUT_CURRENCIES)[number];

export function isLocalCheckoutCurrency(
  code: string,
): code is LocalCheckoutCurrency {
  return (LOCAL_CHECKOUT_CURRENCIES as readonly string[]).includes(code);
}

const CLEAN_PRICE_THRESHOLD = new Decimal(10_000);
const STEP_BELOW_THRESHOLD = new Decimal(10);
const STEP_AT_OR_ABOVE_THRESHOLD = new Decimal(100);

/**
 * Rounds a decimal-string local-currency amount UP to the nearest clean
 * step per the policy above. `ceil()` on a non-negative Decimal is
 * equivalent to Decimal.ROUND_UP — money here is always >= 0.
 */
export function roundToCleanLocalPrice(amount: string): string {
  const value = new Decimal(amount);
  const step = value.gte(CLEAN_PRICE_THRESHOLD)
    ? STEP_AT_OR_ABOVE_THRESHOLD
    : STEP_BELOW_THRESHOLD;
  return value.div(step).ceil().mul(step).toFixed(2);
}

export type LocalPriceConversion = {
  /** Clean, rounded local-currency amount, e.g. "3670.00". */
  localAmount: string;
  /** Stripe zero-decimal-adjusted minor units (all four currencies use 2
   * decimals), e.g. 367000 for "3670.00". */
  minorUnits: number;
};

/**
 * Converts a USD monthly plan price to the org's local currency using the
 * latest USD->local exchange rate (rateToBase, per latestRateToBaseInTx —
 * "multiply an amount in currency_code by this to get base currency"), then
 * applies the clean-price rounding policy.
 */
export function convertPlanPriceToLocal(
  monthlyPriceUsd: string,
  rateToBase: string,
): LocalPriceConversion {
  const rawLocal = new Decimal(monthlyPriceUsd).mul(new Decimal(rateToBase));
  const localAmount = roundToCleanLocalPrice(rawLocal.toFixed(2));

  const minorUnitsDecimal = new Decimal(localAmount).mul(100);
  if (!minorUnitsDecimal.isInteger()) {
    throw new Error(
      `plan-pricing: expected integral minor units, got ${minorUnitsDecimal.toString()}`,
    );
  }
  return { localAmount, minorUnits: minorUnitsDecimal.toNumber() };
}

const RATE_FRESHNESS_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * A rate is fresh iff it was valid within the last 7 days (inclusive) of
 * `now`. Rates older than 7 days fall back to USD checkout.
 */
export function isRateFresh(validDate: Date, now: Date): boolean {
  const ageMs = now.getTime() - validDate.getTime();
  return ageMs >= 0 && ageMs <= RATE_FRESHNESS_WINDOW_MS;
}

/**
 * Deterministic, lowercase Stripe price lookup_key for a dynamically
 * created local-currency plan price, e.g. buildPriceLookupKey("semilla",
 * "NIO") -> "agropeq_semilla_nio_monthly". Used both to create the Price
 * and to look it up for reuse (no DB table — lookup_key is the cache).
 */
export function buildPriceLookupKey(planId: string, currency: string): string {
  return `agropeq_${planId.toLowerCase()}_${currency.toLowerCase()}_monthly`;
}
