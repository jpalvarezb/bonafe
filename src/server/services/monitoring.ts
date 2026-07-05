import { and, desc, eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { cropCycles, monitoringRecords, parcels } from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { newId } from "@/lib/ids";

export type MonitoringRecordInput = {
  parcelId: string;
  cropCycleId?: string | null;
  date: string;
  type: "pest" | "disease" | "weed";
  agentName: string;
  severity: number;
  incidencePct?: string | null;
  notes?: string | null;
  actionsTaken?: string | null;
};

export async function listMonitoring(
  ctx: OrgContext,
  filter?: { parcelId?: string },
) {
  return db
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
    .limit(200);
}

export async function createMonitoringRecord(
  ctx: OrgContext,
  input: MonitoringRecordInput,
) {
  assertCan(ctx, "monitoring", "create");
  const [parcel] = await db
    .select({ id: parcels.id })
    .from(parcels)
    .where(and(eq(parcels.id, input.parcelId), eq(parcels.orgId, ctx.org.id)))
    .limit(1);
  if (!parcel) throw new Error("parcel not found");

  if (input.cropCycleId) {
    const [cycle] = await db
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

  const [created] = await db
    .insert(monitoringRecords)
    .values({
      id: newId(),
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
      createdBy: ctx.user.id,
    })
    .returning();
  return created;
}

export async function deleteMonitoringRecord(ctx: OrgContext, id: string) {
  assertCan(ctx, "monitoring", "delete");
  await db
    .delete(monitoringRecords)
    .where(
      and(eq(monitoringRecords.id, id), eq(monitoringRecords.orgId, ctx.org.id)),
    );
}
