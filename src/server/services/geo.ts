import { sql } from "drizzle-orm";
import { withOrgRls, type Tx } from "@/lib/db/rls";
import type { OrgContext } from "@/lib/tenancy";

export type LatLng = { lat: number; lng: number };

/**
 * A farm's representative point: the centroid of the union of its parcels'
 * boundaries (PostGIS). Returns null when the farm has no drawn parcels —
 * satellite ingest then has nothing to anchor to and callers surface a
 * "draw a parcel first" message.
 *
 * Exported as an `...InTx` variant too: climate-ingest's ingestRainfall
 * needs this inside its own transaction, not a second nested one.
 */
export async function farmCentroidInTx(
  tx: Tx,
  ctx: OrgContext,
  farmId: string,
): Promise<LatLng | null> {
  const result = await tx.execute(sql`
    SELECT ST_Y(c) AS lat, ST_X(c) AS lng
    FROM (
      SELECT ST_Centroid(ST_Union(boundary)) AS c
      FROM parcels
      WHERE farm_id = ${farmId}
        AND org_id = ${ctx.org.id}
        AND boundary IS NOT NULL
    ) sub
    WHERE c IS NOT NULL
  `);
  const row = result.rows[0] as
    | { lat: number | string; lng: number | string }
    | undefined;
  if (!row || row.lat == null) return null;
  return { lat: Number(row.lat), lng: Number(row.lng) };
}

export async function farmCentroid(
  ctx: OrgContext,
  farmId: string,
): Promise<LatLng | null> {
  return withOrgRls(ctx.org.id, (tx) => farmCentroidInTx(tx, ctx, farmId));
}

export type ParcelCentroid = LatLng & { parcelId: string };

/**
 * Per-parcel centroids for every parcel of a farm that has a drawn boundary
 * — used to anchor work-order markers on the map cockpit. One bulk query
 * for the whole farm rather than one `farmCentroidInTx`-style call per
 * parcel.
 *
 * Exported as an `...InTx` variant too, following the module's convention,
 * so callers already inside a transaction (e.g. cockpitData's Promise.all
 * of independent outer withOrgRls calls) can still use it directly if
 * needed without nesting.
 */
export async function parcelCentroidsInTx(
  tx: Tx,
  ctx: OrgContext,
  farmId: string,
): Promise<ParcelCentroid[]> {
  const result = await tx.execute(sql`
    SELECT id AS parcel_id, ST_Y(ST_Centroid(boundary)) AS lat, ST_X(ST_Centroid(boundary)) AS lng
    FROM parcels
    WHERE farm_id = ${farmId}
      AND org_id = ${ctx.org.id}
      AND boundary IS NOT NULL
  `);
  return result.rows.map((row) => {
    const r = row as {
      parcel_id: string;
      lat: number | string;
      lng: number | string;
    };
    return { parcelId: r.parcel_id, lat: Number(r.lat), lng: Number(r.lng) };
  });
}

export async function parcelCentroids(
  ctx: OrgContext,
  farmId: string,
): Promise<ParcelCentroid[]> {
  return withOrgRls(ctx.org.id, (tx) => parcelCentroidsInTx(tx, ctx, farmId));
}
