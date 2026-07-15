import Decimal from "decimal.js";
import { z } from "zod";

/**
 * Pure, network-free FX module. No `fetch` call lives in this file — see
 * openErApiProvider in src/server/services/fx-ingest.ts for the only place
 * network I/O happens. Everything here is safe to unit test with fixtures.
 */

// ---------------------------------------------------------------------------
// Feed response shape (open.er-api.com/v6/latest/USD)
// ---------------------------------------------------------------------------

/**
 * Zod schema for the open.er-api.com/v6/latest/USD response. `result` must
 * be exactly "success" (open.er-api.com returns "error" + an
 * `error-type` field otherwise); `rates` is a USD-quoted map ("1 USD = N
 * <code>") and every value must be numeric.
 */
export const fxFeedResponseSchema = z.object({
  result: z.literal("success"),
  base_code: z.string(),
  rates: z.record(z.string(), z.number()),
  time_last_update_utc: z.string().optional(),
});

export type FxFeedResponse = z.infer<typeof fxFeedResponseSchema>;

/** The USD-quoted rate map alone, as consumed by computeRateToBase. */
export type UsdQuotedRates = FxFeedResponse["rates"];

// ---------------------------------------------------------------------------
// Provider interface — abstracts the network call so the source is swappable
// and tests can inject a fake.
// ---------------------------------------------------------------------------

export interface FxRateProvider {
  fetchLatestUsdRates(): Promise<unknown>;
}

/**
 * Fetches (via the injected provider function) and validates a raw feed
 * payload, throwing if the shape doesn't match fxFeedResponseSchema. Takes
 * a plain async function rather than an FxRateProvider object so tests can
 * inject a bare fake with no network access at all — see
 * tests/unit/fx-rates.test.ts.
 */
export async function fetchAndValidateFxRates(
  fetchRaw: () => Promise<unknown>,
): Promise<FxFeedResponse> {
  const raw = await fetchRaw();
  return fxFeedResponseSchema.parse(raw);
}

// ---------------------------------------------------------------------------
// Pure rate math
// ---------------------------------------------------------------------------

const d = (value: string | number) => new Decimal(value);

/**
 * Cross-rates a USD-quoted feed into "multiply an amount in `currency` by
 * this to get `baseCurrency`" — the exact contract documented on
 * org_exchange_rates.rate_to_base (src/lib/db/schema/billing.ts) and relied
 * on by latestRateToBaseInTx / sales.ts:
 *
 *   rateToBase(currency -> base) = usdRates[base] / usdRates[currency]
 *
 * because usdRates[code] is "1 USD = N <code>" for every code, so
 * usdRates[base]/usdRates[currency] = "N <base> per 1 <currency>".
 *
 * Output is a Decimal string fixed to 8 decimal places, matching the
 * numeric(18,8) column. Throws if either currency is missing from the feed
 * (fail loudly rather than silently dropping a currency).
 */
export function computeRateToBase(
  usdRates: UsdQuotedRates,
  currency: string,
  baseCurrency: string,
): string {
  const baseRate = usdRates[baseCurrency];
  const currencyRate = usdRates[currency];
  if (baseRate === undefined) {
    throw new Error(`fx feed missing rate for base currency ${baseCurrency}`);
  }
  if (currencyRate === undefined) {
    throw new Error(`fx feed missing rate for currency ${currency}`);
  }
  return d(baseRate).div(d(currencyRate)).toFixed(8);
}
