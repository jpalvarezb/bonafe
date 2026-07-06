/**
 * Nightly satellite rainfall ingest via Open-Meteo (keyless, synchronous —
 * no async poll like CHIRPS) for every farm, across every org, that has at
 * least one drawn parcel. Ingests a single day: today - 2, matching the
 * ingest service's own satellite-lag clamp (src/server/services/
 * climate-ingest.ts).
 *
 * No OrgContext exists in a script (no session, no requireOrgContext), so
 * this cannot call the assertCan-gated ingestRainfall service function.
 * Instead it resolves org id, farm id, and farm centroid straight from the
 * DB (one raw-SQL query, mirroring farmCentroid's PostGIS centroid logic in
 * src/server/services/geo.ts but across every farm at once) and calls
 * ingestRainfallCore directly with those plain values. That bypass is safe
 * here because this is a trusted, unattended job with no untrusted user
 * input, unlike the org-scoped UI action which handles form submissions
 * from members.
 *
 * Run with: pnpm climate:ingest
 */
import { sql } from "drizzle-orm";
import { db } from "../lib/db";
import { ingestRainfallCore } from "../server/services/climate-ingest";

const PAUSE_MS = 300;
const LAG_DAYS = 2;

type FarmRow = {
  farmId: string;
  orgId: string;
  lat: number;
  lng: number;
};

/** Every farm, across every org, that has at least one parcel with a boundary. */
async function farmsWithParcels(): Promise<FarmRow[]> {
  const result = await db.execute(sql`
    SELECT f.id AS farm_id, f.org_id AS org_id, ST_Y(c.pt) AS lat, ST_X(c.pt) AS lng
    FROM farms f
    JOIN LATERAL (
      SELECT ST_Centroid(ST_Union(p.boundary)) AS pt
      FROM parcels p
      WHERE p.farm_id = f.id AND p.boundary IS NOT NULL
    ) c ON c.pt IS NOT NULL
  `);
  return result.rows.map((row) => {
    const r = row as {
      farm_id: string;
      org_id: string;
      lat: number | string;
      lng: number | string;
    };
    return {
      farmId: r.farm_id,
      orgId: r.org_id,
      lat: Number(r.lat),
      lng: Number(r.lng),
    };
  });
}

function targetDate(): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - LAG_DAYS);
  return d.toISOString().slice(0, 10);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  const date = targetDate();
  const farms = await farmsWithParcels();
  console.log(
    `climate:ingest — ${farms.length} farm(s) with parcels, date ${date} (open_meteo)`,
  );

  let ok = 0;
  let failed = 0;

  // Sequential with a pause between farms — rate-friendly toward the
  // keyless Open-Meteo endpoint rather than firing every farm at once.
  for (const farm of farms) {
    try {
      const count = await ingestRainfallCore(
        farm.orgId,
        farm.farmId,
        { lat: farm.lat, lng: farm.lng },
        date,
        date,
        "open_meteo",
      );
      console.log(
        `  ok    farm=${farm.farmId} org=${farm.orgId} rows=${count}`,
      );
      ok++;
    } catch (error) {
      console.error(
        `  fail  farm=${farm.farmId} org=${farm.orgId}:`,
        error instanceof Error ? error.message : error,
      );
      failed++;
    }
    await sleep(PAUSE_MS);
  }

  console.log(`climate:ingest done — ok=${ok} failed=${failed}`);
  // Total failure must be visible to cron/health monitors via the exit code.
  if (failed > 0 && ok === 0) process.exitCode = 1;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
