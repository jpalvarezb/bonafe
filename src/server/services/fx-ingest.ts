/**
 * Nightly FX rate ingest via open.er-api.com (keyless, USD-quoted) for every
 * org, across every currency in CURRENCY_CODES other than the org's own
 * base. Fetches and validates the feed ONCE (network I/O never holds a
 * Postgres transaction/connection open — same discipline as
 * ingestRainfallCore in src/server/services/climate-ingest.ts), then sweeps
 * orgs via dbSystem.
 *
 * No OrgContext exists in a script (no session, no requireOrgContext), so
 * this bypasses the assertCan-gated upsertExchangeRate and writes straight
 * via dbSystem instead — mirroring upsertRainfallDays/ingestRainfallCore.
 * That's an acceptable bypass because this is a trusted, unattended job with
 * no untrusted user input, unlike the org-scoped UI action.
 *
 * Run with: pnpm fx:ingest
 */
// dbSystem: owner connection, bypasses RLS. Unattended, cross-org job with no
// OrgContext/app.org_id — matches the climate ingest cron's own use of
// dbSystem for the same reason.
import { dbSystem } from "@/lib/db";
import { organization, orgExchangeRates } from "@/lib/db/schema";
import { newId } from "@/lib/ids";
import { CURRENCY_CODES } from "@/lib/currency";
import {
  computeRateToBase,
  fetchAndValidateFxRates,
  type FxRateProvider,
} from "@/lib/fx-rates";

const OPEN_ER_API_URL = "https://open.er-api.com/v6/latest/USD";

/**
 * The only place `fetch` is called for FX rates — everything in
 * src/lib/fx-rates.ts is pure and network-free (see its own doc comment).
 */
export const openErApiProvider: FxRateProvider = {
  async fetchLatestUsdRates(): Promise<unknown> {
    const res = await fetch(OPEN_ER_API_URL, {
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      throw new Error(`open.er-api.com responded with status ${res.status}`);
    }
    return res.json();
  },
};

export type IngestFxResult = {
  orgsSwept: number;
  rowsWritten: number;
  missingCurrencyCodes: string[];
};

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/**
 * SCRIPT-ONLY (dbSystem): fetch+validate the feed once, then upsert one
 * org_exchange_rates row per (org, currency != org base) for today, keyed on
 * the (org_id, currency_code, valid_date) unique index — idempotent per day,
 * safe to re-run.
 */
export async function ingestFxRatesCore(
  provider: FxRateProvider = openErApiProvider,
): Promise<IngestFxResult> {
  const feed = await fetchAndValidateFxRates(() =>
    provider.fetchLatestUsdRates(),
  );
  const usdRates = feed.rates;
  const validDate = todayIso();
  const fetchedAt = new Date();

  // Fail loudly (log), never silently, when the feed is missing a currency
  // this app cares about — the per-org write loop below still skips only
  // the affected (org, currency) pairs rather than aborting the whole run.
  const missingCurrencyCodes = CURRENCY_CODES.filter(
    (code) => usdRates[code] === undefined,
  );
  if (missingCurrencyCodes.length > 0) {
    console.error(
      `fx:ingest — feed is missing rate(s) for: ${missingCurrencyCodes.join(", ")}`,
    );
  }

  const orgs = await dbSystem
    .select({ id: organization.id, baseCurrencyCode: organization.baseCurrencyCode })
    .from(organization);

  let rowsWritten = 0;
  for (const org of orgs) {
    for (const currencyCode of CURRENCY_CODES) {
      if (currencyCode === org.baseCurrencyCode) continue;

      let rateToBase: string;
      try {
        rateToBase = computeRateToBase(
          usdRates,
          currencyCode,
          org.baseCurrencyCode,
        );
      } catch (error) {
        console.error(
          `fx:ingest — skipping org=${org.id} currency=${currencyCode}:`,
          error instanceof Error ? error.message : error,
        );
        continue;
      }

      await dbSystem
        .insert(orgExchangeRates)
        .values({
          id: newId(),
          orgId: org.id,
          currencyCode,
          rateToBase,
          validDate,
          source: "open-er-api",
          fetchedAt,
        })
        .onConflictDoUpdate({
          target: [
            orgExchangeRates.orgId,
            orgExchangeRates.currencyCode,
            orgExchangeRates.validDate,
          ],
          set: { rateToBase, source: "open-er-api", fetchedAt },
        });
      rowsWritten++;
    }
  }

  return { orgsSwept: orgs.length, rowsWritten, missingCurrencyCodes };
}
