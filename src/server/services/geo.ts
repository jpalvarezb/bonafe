import { sql } from "drizzle-orm";
import { db } from "@/lib/db";
import type { OrgContext } from "@/lib/tenancy";

export type LatLng = { lat: number; lng: number };

/**
 * A farm's representative point: the centroid of the union of its parcels'
 * boundaries (PostGIS). Returns null when the farm has no drawn parcels —
 * satellite ingest then has nothing to anchor to and callers surface a
 * "draw a parcel first" message.
 */
export async function farmCentroid(
  ctx: OrgContext,
  farmId: string,
): Promise<LatLng | null> {
  const result = await db.execute(sql`
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
