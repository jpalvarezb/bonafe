import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { farms, parcels } from "@/lib/db/schema";
import type { GeoJsonPolygon } from "@/lib/db/geometry";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { newId } from "@/lib/ids";

/** Flat string map persisted into parcels.attributes; never raw client JSON. */
export const parcelAttributesSchema = z
  .record(z.string().min(1).max(40), z.string().max(200))
  .refine((attrs) => Object.keys(attrs).length <= 20, {
    message: "at most 20 attribute pairs",
  });

export type ParcelAttributes = z.infer<typeof parcelAttributesSchema>;

/** Hectares from a 4326 polygon, measured on the geography spheroid. */
async function computeAreaHa(boundary: GeoJsonPolygon): Promise<string> {
  const result = await db.execute<{ area_ha: string }>(sql`
    SELECT (ST_Area(ST_GeomFromGeoJSON(${JSON.stringify(boundary)})::geography) / 10000.0)::numeric(12,4) AS area_ha
  `);
  return result.rows[0].area_ha;
}

async function validateBoundary(boundary: GeoJsonPolygon): Promise<void> {
  const result = await db.execute<{ valid: boolean }>(sql`
    SELECT ST_IsValid(ST_GeomFromGeoJSON(${JSON.stringify(boundary)})) AS valid
  `);
  if (!result.rows[0].valid) {
    throw new Error("invalid polygon");
  }
}

export type ParcelInput = {
  farmId: string;
  name: string;
  code?: string;
  soilType?: string;
  boundary?: GeoJsonPolygon | null;
  /** Manual override; when absent and a boundary exists, computed via PostGIS. */
  areaHa?: string | null;
  attributes?: ParcelAttributes;
};

export async function createParcel(ctx: OrgContext, input: ParcelInput) {
  assertCan(ctx, "parcel", "create");
  const [farm] = await db
    .select({ id: farms.id })
    .from(farms)
    .where(and(eq(farms.id, input.farmId), eq(farms.orgId, ctx.org.id)))
    .limit(1);
  if (!farm) throw new Error("farm not found");
  let areaHa = input.areaHa ?? null;
  if (input.boundary) {
    await validateBoundary(input.boundary);
    areaHa ??= await computeAreaHa(input.boundary);
  }
  const attributes = parcelAttributesSchema.parse(input.attributes ?? {});
  const [created] = await db
    .insert(parcels)
    .values({
      id: newId(),
      orgId: ctx.org.id,
      farmId: input.farmId,
      name: input.name,
      code: input.code ?? null,
      soilType: input.soilType ?? null,
      boundary: input.boundary ?? null,
      areaHa,
      attributes,
    })
    .returning();
  return created;
}

export async function updateParcel(
  ctx: OrgContext,
  parcelId: string,
  input: Partial<ParcelInput>,
) {
  assertCan(ctx, "parcel", "update");
  let areaHa = input.areaHa;
  if (input.boundary) {
    await validateBoundary(input.boundary);
    areaHa ??= await computeAreaHa(input.boundary);
  }
  const attributes =
    input.attributes !== undefined
      ? parcelAttributesSchema.parse(input.attributes)
      : undefined;
  const [updated] = await db
    .update(parcels)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.code !== undefined && { code: input.code }),
      ...(input.soilType !== undefined && { soilType: input.soilType }),
      ...(input.boundary !== undefined && { boundary: input.boundary }),
      ...(areaHa !== undefined && { areaHa }),
      ...(attributes !== undefined && { attributes }),
    })
    .where(and(eq(parcels.id, parcelId), eq(parcels.orgId, ctx.org.id)))
    .returning();
  return updated;
}

export async function deleteParcel(ctx: OrgContext, parcelId: string) {
  assertCan(ctx, "parcel", "delete");
  await db
    .delete(parcels)
    .where(and(eq(parcels.id, parcelId), eq(parcels.orgId, ctx.org.id)));
}

export async function listParcels(ctx: OrgContext, farmId?: string) {
  return db
    .select()
    .from(parcels)
    .where(
      and(
        eq(parcels.orgId, ctx.org.id),
        farmId ? eq(parcels.farmId, farmId) : undefined,
      ),
    )
    .orderBy(parcels.name);
}
