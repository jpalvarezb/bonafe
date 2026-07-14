/**
 * Nightly FX rate ingest via open.er-api.com (keyless, USD-quoted) — writes
 * one org_exchange_rates row per (org, currency != org base) for today.
 * Idempotent: re-running the same day overwrites the same rows via
 * onConflictDoUpdate on (org_id, currency_code, valid_date).
 *
 * All the fetch+validate+cross-rate work is done by ingestFxRatesCore
 * (src/server/services/fx-ingest.ts); this script is just the cron
 * entry point, matching src/scripts/ingest-climate.ts's per-item
 * try/catch + ok/fail summary shape (though here the whole feed fetch is one
 * unit of work rather than per-farm, so failure is reported at that
 * granularity instead of per-org).
 *
 * Run with: pnpm fx:ingest
 */
import { ingestFxRatesCore } from "../server/services/fx-ingest";

async function main() {
  console.log("fx:ingest — fetching open.er-api.com/v6/latest/USD");

  let result: Awaited<ReturnType<typeof ingestFxRatesCore>>;
  try {
    result = await ingestFxRatesCore();
  } catch (error) {
    console.error(
      "fx:ingest — fatal: could not fetch/validate the feed:",
      error instanceof Error ? error.message : error,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `  ok    orgs=${result.orgsSwept} rows=${result.rowsWritten}` +
      (result.missingCurrencyCodes.length > 0
        ? ` missing=${result.missingCurrencyCodes.join(",")}`
        : ""),
  );

  console.log(
    `fx:ingest done — orgs=${result.orgsSwept} rows=${result.rowsWritten}`,
  );
  // Total failure (feed unreachable/invalid) must be visible to cron/health
  // monitors via the exit code; a merely partial feed (some currencies
  // missing, already logged loudly above) is not fatal.
  if (result.rowsWritten === 0 && result.orgsSwept > 0) {
    process.exitCode = 1;
  }
}

main()
  .then(() => process.exit(process.exitCode ?? 0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
