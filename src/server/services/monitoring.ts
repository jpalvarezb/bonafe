import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { withOrgRls } from "@/lib/db/rls";
import { cropCycles, monitoringRecords, parcels } from "@/lib/db/schema";
import type { GeoJsonPoint } from "@/lib/db/geometry";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { newId } from "@/lib/ids";

/** A single photo attachment reference. Upload UI is future work (Capacitor
 * camera integration); this schema locks the `photos` jsonb contract now so
 * no writer can land malformed rows ahead of that feature. */
export const monitoringPhotoSchema = z.object({
  path: z.string().min(1),
  caption: z.string().max(200).optional(),
});
export type MonitoringPhoto = z.infer<typeof monitoringPhotoSchema>;

/** Mirrors the column default of `[]`; at most 10 photos per record. */
export const monitoringPhotosSchema = z
  .array(monitoringPhotoSchema)
  .max(10)
  .default([]);

export type GeoLocation = { lat: number; lng: number };

/** GeoJSON is lng-first ([lng, lat]) — see src/lib/db/geometry.ts and how
 * parcel boundaries are drawn/read in src/components/map/parcel-draw-map.tsx. */
export function toPointGeometry(location: GeoLocation): GeoJsonPoint {
  return { type: "Point", coordinates: [location.lng, location.lat] };
}

export type MonitoringRecordInput = {
  /** Client-generated UUIDv7 for offline idempotency; server fills if absent. */
  id?: string;
  parcelId: string;
  cropCycleId?: string | null;
  date: string;
  type: "pest" | "disease" | "weed";
  agentName: string;
  severity: number;
  incidencePct?: string | null;
  notes?: string | null;
  actionsTaken?: string | null;
  /** Device GPS fix captured client-side; optional and offline-safe. */
  location?: GeoLocation | null;
  /** Future work: no writer sends this yet (upload UI not built). Validated
   * here so the contract is locked in ahead of that feature. */
  photos?: unknown;
};

export async function listMonitoring(
  ctx: OrgContext,
  filter?: { parcelId?: string },
) {
  return withOrgRls(ctx.org.id, (tx) =>
    tx
      .select({
        record: monitoringRecords,
        parcelName: parcels.name,
        cycleName: cropCycles.name,
      })
      .from(monitoringRecords)
      .innerJoin(parcels, eq(monitoringRecords.parcelId, parcels.id))
      .leftJoin(cropCycles, eq(monitoringRecords.cropCycleId, cropCycles.id))
      .where(
        and(
          eq(monitoringRecords.orgId, ctx.org.id),
          filter?.parcelId
            ? eq(monitoringRecords.parcelId, filter.parcelId)
            : undefined,
        ),
      )
      .orderBy(desc(monitoringRecords.date))
      .limit(200),
  );
}

export async function createMonitoringRecord(
  ctx: OrgContext,
  input: MonitoringRecordInput,
) {
  assertCan(ctx, "monitoring", "create");
  return withOrgRls(ctx.org.id, async (tx) => {
    const [parcel] = await tx
      .select({ id: parcels.id, active: parcels.active })
      .from(parcels)
      .where(and(eq(parcels.id, input.parcelId), eq(parcels.orgId, ctx.org.id)))
      .limit(1);
    if (!parcel) throw new Error("parcel not found");
    if (!parcel.active) throw new Error("parcel is inactive");

    if (input.cropCycleId) {
      const [cycle] = await tx
        .select({ id: cropCycles.id })
        .from(cropCycles)
        .where(
          and(
            eq(cropCycles.id, input.cropCycleId),
            eq(cropCycles.orgId, ctx.org.id),
            eq(cropCycles.parcelId, input.parcelId),
          ),
        )
        .limit(1);
      if (!cycle) throw new Error("crop cycle not found");
    }

    const recordId = input.id ?? newId();
    const [created] = await tx
      .insert(monitoringRecords)
      .values({
        id: recordId,
        orgId: ctx.org.id,
        parcelId: input.parcelId,
        cropCycleId: input.cropCycleId ?? null,
        date: input.date,
        type: input.type,
        agentName: input.agentName,
        severity: input.severity,
        incidencePct: input.incidencePct ?? null,
        notes: input.notes ?? null,
        actionsTaken: input.actionsTaken ?? null,
        location: input.location ? toPointGeometry(input.location) : null,
        ...(input.photos !== undefined && {
          photos: monitoringPhotosSchema.parse(input.photos),
        }),
        createdBy: ctx.user.id,
      })
      .onConflictDoNothing({ target: monitoringRecords.id })
      .returning();

    // Idempotent replay from the offline outbox: row already exists.
    if (!created) {
      const [existing] = await tx
        .select()
        .from(monitoringRecords)
        .where(
          and(
            eq(monitoringRecords.id, recordId),
            eq(monitoringRecords.orgId, ctx.org.id),
          ),
        );
      if (!existing) throw new Error("monitoring record id conflict");
      return { record: existing, created: false };
    }
    return { record: created, created: true };
  });
}

export async function deleteMonitoringRecord(ctx: OrgContext, id: string) {
  assertCan(ctx, "monitoring", "delete");
  await withOrgRls(ctx.org.id, (tx) =>
    tx
      .delete(monitoringRecords)
      .where(
        and(eq(monitoringRecords.id, id), eq(monitoringRecords.orgId, ctx.org.id)),
      ),
  );
}
