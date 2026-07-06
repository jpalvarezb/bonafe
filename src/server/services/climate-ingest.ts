import { z } from "zod";
import { db } from "@/lib/db";
import { climateReadings } from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { newId } from "@/lib/ids";
import { getFarm } from "@/server/services/farms";
import { farmCentroid, type LatLng } from "@/server/services/geo";

export type IngestProvider = "open_meteo" | "chirps";

export type RainfallDay = {
  date: string;
  rainfallMm: string | null;
  tempMinC?: string | null;
  tempMaxC?: string | null;
};

export type IngestResult = {
  count: number;
  provider: IngestProvider;
  from: string;
  to: string;
};

// Satellite archives (both Open-Meteo's derived reanalysis and CHIRPS) lag
// real time by roughly 2-5 days, so any requested `to` date newer than this
// is silently clamped back — asking for "yesterday" would otherwise return
// nulls for the last couple of days instead of a clean error.
const SATELLITE_LAG_DAYS = 2;
const MAX_SPAN_DAYS = 92;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString().slice(0, 10);
}

/**
 * Range guard shared by the UI action and (indirectly, via the same
 * defaults) the cron script: from <= to, span <= 92 days, and `to` clamped
 * to today - SATELLITE_LAG_DAYS so we never request dates the provider
 * hasn't populated yet.
 */
function clampRange(from: string, to: string): { from: string; to: string } {
  const maxTo = isoDaysAgo(SATELLITE_LAG_DAYS);
  const clampedTo = to > maxTo ? maxTo : to;
  if (from > clampedTo) throw new Error("invalid range");
  const spanDays = Math.round(
    (Date.parse(clampedTo) - Date.parse(from)) / 86_400_000,
  );
  if (spanDays > MAX_SPAN_DAYS) throw new Error("range too long");
  return { from, to: clampedTo };
}

// ---------------------------------------------------------------------------
// Open-Meteo archive (keyless, synchronous, instant)
// ---------------------------------------------------------------------------

const openMeteoSchema = z.object({
  daily: z.object({
    time: z.array(z.string()),
    precipitation_sum: z.array(z.number().nullable()),
    temperature_2m_min: z.array(z.number().nullable()),
    temperature_2m_max: z.array(z.number().nullable()),
  }),
});

export async function fetchOpenMeteo(
  point: LatLng,
  from: string,
  to: string,
): Promise<RainfallDay[]> {
  const url = new URL("https://archive-api.open-meteo.com/v1/archive");
  url.searchParams.set("latitude", String(point.lat));
  url.searchParams.set("longitude", String(point.lng));
  url.searchParams.set("start_date", from);
  url.searchParams.set("end_date", to);
  url.searchParams.set(
    "daily",
    "precipitation_sum,temperature_2m_min,temperature_2m_max",
  );
  url.searchParams.set("timezone", "UTC");

  let json: unknown;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(20_000) });
    if (!res.ok) throw new Error(`status ${res.status}`);
    json = await res.json();
  } catch {
    throw new Error("provider unavailable");
  }

  const parsed = openMeteoSchema.safeParse(json);
  if (!parsed.success) throw new Error("provider unavailable");

  const { time, precipitation_sum, temperature_2m_min, temperature_2m_max } =
    parsed.data.daily;

  return time.map((date, i) => ({
    date,
    rainfallMm:
      precipitation_sum[i] != null ? precipitation_sum[i]!.toFixed(2) : null,
    tempMinC:
      temperature_2m_min[i] != null ? temperature_2m_min[i]!.toFixed(2) : null,
    tempMaxC:
      temperature_2m_max[i] != null ? temperature_2m_max[i]!.toFixed(2) : null,
  }));
}

// ---------------------------------------------------------------------------
// ClimateSERV CHIRPS (keyless, async job + bounded poll, rainfall only)
// ---------------------------------------------------------------------------

const CHIRPS_BASE = "https://climateserv.servirglobal.net/api";
const CHIRPS_POLL_ATTEMPTS = 5;
const CHIRPS_POLL_INTERVAL_MS = 2_000;

// submitDataRequest replies with a one-element array holding the request id.
const chirpsSubmitSchema = z.array(z.string()).min(1);

const chirpsDataSchema = z.object({
  data: z.array(
    z.object({
      date: z.string(),
      value: z.object({ avg: z.number().nullable() }),
    }),
  ),
});

function isoToMmDdYyyy(iso: string): string {
  const [y, m, d] = iso.split("-");
  return `${m}/${d}/${y}`;
}

function mmDdYyyyToIso(value: string): string {
  const [m, d, y] = value.split("/");
  return `${y}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function fetchChirps(
  point: LatLng,
  from: string,
  to: string,
): Promise<RainfallDay[]> {
  const geometrycollection = {
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: { type: "Point", coordinates: [point.lng, point.lat] },
        properties: {},
      },
    ],
  };

  const submitParams = new URLSearchParams({
    datatype: "0",
    operationtype: "5",
    begintime: isoToMmDdYyyy(from),
    endtime: isoToMmDdYyyy(to),
    geometrycollection: JSON.stringify(geometrycollection),
  });

  let requestId: string;
  try {
    const res = await fetch(
      `${CHIRPS_BASE}/submitDataRequest/?${submitParams}`,
      { signal: AbortSignal.timeout(8_000) },
    );
    if (!res.ok) throw new Error(`status ${res.status}`);
    const parsed = chirpsSubmitSchema.safeParse(await res.json());
    if (!parsed.success) throw new Error("bad shape");
    requestId = parsed.data[0];
  } catch {
    throw new Error("provider unavailable");
  }

  // ClimateSERV is a flaky, best-effort keyless service: poll a bounded
  // number of times and treat anything short of a clean 100% + data payload
  // as a clean failure so the UI can suggest Open-Meteo instead of hanging.
  for (let attempt = 0; attempt < CHIRPS_POLL_ATTEMPTS; attempt++) {
    await sleep(CHIRPS_POLL_INTERVAL_MS);
    try {
      const progressRes = await fetch(
        `${CHIRPS_BASE}/getDataRequestProgress/?id=${requestId}`,
        { signal: AbortSignal.timeout(8_000) },
      );
      if (!progressRes.ok) continue;
      const progressJson: unknown = await progressRes.json();
      const pct = Number(
        typeof progressJson === "number"
          ? progressJson
          : ((progressJson as Record<string, unknown> | null)?.progress ??
              (progressJson as Record<string, unknown> | null)?.percent ??
              NaN),
      );
      if (!(pct >= 100)) continue;

      const dataRes = await fetch(
        `${CHIRPS_BASE}/getDataFromRequest/?id=${requestId}`,
        { signal: AbortSignal.timeout(8_000) },
      );
      if (!dataRes.ok) throw new Error(`status ${dataRes.status}`);
      const parsedData = chirpsDataSchema.safeParse(await dataRes.json());
      if (!parsedData.success) throw new Error("bad shape");

      return parsedData.data.data.map((row) => ({
        date: mmDdYyyyToIso(row.date),
        rainfallMm: row.value.avg != null ? row.value.avg.toFixed(2) : null,
      }));
    } catch {
      // A single flaky poll shouldn't abort the whole request — keep trying
      // until CHIRPS_POLL_ATTEMPTS is exhausted, then fail cleanly below.
    }
  }
  throw new Error("provider unavailable");
}

// ---------------------------------------------------------------------------
// Upsert core — shared by the org-scoped service below and the cron script
// ---------------------------------------------------------------------------

/**
 * Writes satellite rainfall rows for one farm/source, idempotently
 * (onConflictDoUpdate on the farm_id/date/source unique index — see
 * src/lib/db/schema/climate.ts). Days with no rainfall value are skipped
 * entirely rather than writing an all-null row.
 *
 * Exported (not just used by ingestRainfall below) so the cron script can
 * call it directly: a script has no OrgContext (no session, no
 * requireOrgContext), so it cannot go through assertCan-gated
 * ingestRainfall. It resolves org/farm ids straight from the DB instead and
 * calls this core with plain values. That's an acceptable bypass because the
 * script is a trusted, unattended job with no untrusted user input, unlike
 * the org-scoped action which handles form submissions from members.
 */
export async function upsertRainfallDays(
  orgId: string,
  farmId: string,
  source: IngestProvider,
  days: RainfallDay[],
): Promise<number> {
  // One transaction so a mid-range DB failure never persists a partial
  // window whose count/banner would then misreport what landed.
  let count = 0;
  await db.transaction(async (tx) => {
    for (const day of days) {
      // "still write the row if precipitation exists" — a day with no
      // rainfall value (provider returned null) carries no signal worth
      // persisting, so skip it rather than writing an empty row.
      if (day.rainfallMm === null) continue;

      await tx
        .insert(climateReadings)
      .values({
        id: newId(),
        orgId,
        farmId,
        date: day.date,
        source,
        rainfallMm: day.rainfallMm,
        tempMinC: day.tempMinC ?? null,
        tempMaxC: day.tempMaxC ?? null,
      })
      .onConflictDoUpdate({
        target: [
          climateReadings.farmId,
          climateReadings.date,
          climateReadings.source,
        ],
        set: {
            rainfallMm: day.rainfallMm,
            tempMinC: day.tempMinC ?? null,
            tempMaxC: day.tempMaxC ?? null,
          },
        });
      count++;
    }
  });
  return count;
}

/** Cron-script entry point — see upsertRainfallDays doc comment for why. */
export async function ingestRainfallCore(
  orgId: string,
  farmId: string,
  point: LatLng,
  from: string,
  to: string,
  provider: IngestProvider = "open_meteo",
): Promise<number> {
  const days =
    provider === "chirps"
      ? await fetchChirps(point, from, to)
      : await fetchOpenMeteo(point, from, to);
  return upsertRainfallDays(orgId, farmId, provider, days);
}

// ---------------------------------------------------------------------------
// Org-scoped orchestration used by the UI action
// ---------------------------------------------------------------------------

export type IngestRainfallInput = {
  farmId: string;
  from: string;
  to: string;
  provider: IngestProvider;
};

export async function ingestRainfall(
  ctx: OrgContext,
  input: IngestRainfallInput,
): Promise<IngestResult> {
  assertCan(ctx, "climate", "create");

  const farm = await getFarm(ctx, input.farmId);
  if (!farm) throw new Error("farm not found");

  const { from, to } = clampRange(input.from, input.to);

  const point = await farmCentroid(ctx, input.farmId);
  if (!point) throw new Error("no parcels");

  const count = await ingestRainfallCore(
    ctx.org.id,
    input.farmId,
    point,
    from,
    to,
    input.provider,
  );

  return { count, provider: input.provider, from, to };
}
