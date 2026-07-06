import { and, desc, eq, inArray, isNull, sum } from "drizzle-orm";
import { db } from "@/lib/db";
import {
  cropCycles,
  harvestLotItems,
  harvestLots,
  harvests,
  parcels,
  processingRuns,
  workers,
} from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { assertOrgFeature } from "@/lib/plan-limits";
import { newId } from "@/lib/ids";

/**
 * Processing is gated by the "sales" entitlement — harvest lots + runs and
 * the sales module are the same Tier-3 feature bundle.
 */
const FEATURE = "sales";

// ---------------------------------------------------------------------------
// Harvest lots
// ---------------------------------------------------------------------------

export type LotUnitTotal = { unit: string; quantity: string };

export type LotCreateInput = {
  cropCycleId: string;
  name: string;
  notes?: string | null;
};

async function requireLotInOrg(ctx: OrgContext, lotId: string) {
  const [lot] = await db
    .select()
    .from(harvestLots)
    .where(and(eq(harvestLots.id, lotId), eq(harvestLots.orgId, ctx.org.id)))
    .limit(1);
  if (!lot) throw new Error("harvest lot not found");
  return lot;
}

/** Lots with cycle name and per-unit totals of their member harvests. */
export async function listLots(ctx: OrgContext) {
  const lots = await db
    .select({ lot: harvestLots, cycleName: cropCycles.name })
    .from(harvestLots)
    .innerJoin(cropCycles, eq(harvestLots.cropCycleId, cropCycles.id))
    .where(eq(harvestLots.orgId, ctx.org.id))
    .orderBy(desc(harvestLots.createdAt));

  if (lots.length === 0) return [];

  // Never sum across units: group totals per (lot, unit) of the linked harvests.
  const aggRows = await db
    .select({
      lotId: harvestLotItems.lotId,
      unit: harvests.unit,
      totalQuantity: sum(harvests.quantity),
    })
    .from(harvestLotItems)
    .innerJoin(harvests, eq(harvestLotItems.harvestId, harvests.id))
    .where(eq(harvestLotItems.orgId, ctx.org.id))
    .groupBy(harvestLotItems.lotId, harvests.unit);

  const itemCountRows = await db
    .select({
      lotId: harvestLotItems.lotId,
      harvestId: harvestLotItems.harvestId,
    })
    .from(harvestLotItems)
    .where(eq(harvestLotItems.orgId, ctx.org.id));

  const totalsByLot = new Map<string, LotUnitTotal[]>();
  for (const row of aggRows) {
    const totals = totalsByLot.get(row.lotId) ?? [];
    totals.push({ unit: row.unit, quantity: row.totalQuantity ?? "0" });
    totalsByLot.set(row.lotId, totals);
  }

  const itemCountByLot = new Map<string, number>();
  for (const row of itemCountRows) {
    itemCountByLot.set(row.lotId, (itemCountByLot.get(row.lotId) ?? 0) + 1);
  }

  return lots.map(({ lot, cycleName }) => ({
    lot,
    cycleName,
    unitTotals: totalsByLot.get(lot.id) ?? [],
    itemCount: itemCountByLot.get(lot.id) ?? 0,
  }));
}

/** Org-scoped single lot + cycle name; null (not a throw) so pages can 404. */
export async function getLot(ctx: OrgContext, lotId: string) {
  const [row] = await db
    .select({ lot: harvestLots, cycleName: cropCycles.name })
    .from(harvestLots)
    .innerJoin(cropCycles, eq(harvestLots.cropCycleId, cropCycles.id))
    .where(and(eq(harvestLots.id, lotId), eq(harvestLots.orgId, ctx.org.id)))
    .limit(1);
  return row ?? null;
}

/** Member harvests of a lot (date, parcel, worker, qty+unit) for the detail table. */
export async function listLotHarvests(ctx: OrgContext, lotId: string) {
  return db
    .select({
      harvest: harvests,
      parcelName: parcels.name,
      workerName: workers.name,
    })
    .from(harvestLotItems)
    .innerJoin(harvests, eq(harvestLotItems.harvestId, harvests.id))
    .innerJoin(parcels, eq(harvests.parcelId, parcels.id))
    .leftJoin(workers, eq(harvests.workerId, workers.id))
    .where(
      and(
        eq(harvestLotItems.lotId, lotId),
        eq(harvestLotItems.orgId, ctx.org.id),
      ),
    )
    .orderBy(desc(harvests.date));
}

/** The cycle's harvests not yet claimed by any lot — candidates to attach. */
export async function listUnattachedHarvestsForCycle(
  ctx: OrgContext,
  cropCycleId: string,
) {
  return db
    .select({
      harvest: harvests,
      parcelName: parcels.name,
      workerName: workers.name,
    })
    .from(harvests)
    .innerJoin(parcels, eq(harvests.parcelId, parcels.id))
    .leftJoin(workers, eq(harvests.workerId, workers.id))
    .leftJoin(harvestLotItems, eq(harvestLotItems.harvestId, harvests.id))
    .where(
      and(
        eq(harvests.orgId, ctx.org.id),
        eq(harvests.cropCycleId, cropCycleId),
        isNull(harvestLotItems.id),
      ),
    )
    .orderBy(desc(harvests.date));
}

export async function createLot(ctx: OrgContext, input: LotCreateInput) {
  assertCan(ctx, "processing", "manage");
  await assertOrgFeature(ctx.org.id, FEATURE);

  const [cycle] = await db
    .select({ id: cropCycles.id })
    .from(cropCycles)
    .where(
      and(
        eq(cropCycles.id, input.cropCycleId),
        eq(cropCycles.orgId, ctx.org.id),
      ),
    )
    .limit(1);
  if (!cycle) throw new Error("crop cycle not found");

  const [created] = await db
    .insert(harvestLots)
    .values({
      id: newId(),
      orgId: ctx.org.id,
      cropCycleId: input.cropCycleId,
      name: input.name,
      notes: input.notes ?? null,
      createdBy: ctx.user.id,
    })
    .returning();
  return created;
}

/**
 * Attaches harvests to an open lot. Every id must belong to the org and to
 * the lot's own crop cycle; the harvest_lot_items unique index guarantees a
 * harvest can't join a second lot, so a benign race there is absorbed via
 * onConflictDoNothing rather than treated as a validation failure.
 */
export async function addHarvestsToLot(
  ctx: OrgContext,
  lotId: string,
  harvestIds: string[],
) {
  assertCan(ctx, "processing", "manage");
  await assertOrgFeature(ctx.org.id, FEATURE);
  if (harvestIds.length === 0) return { requested: 0, attached: 0 };

  const lot = await requireLotInOrg(ctx, lotId);
  if (lot.status !== "open") throw new Error("harvest lot is closed");

  const validHarvests = await db
    .select({ id: harvests.id })
    .from(harvests)
    .where(
      and(
        inArray(harvests.id, harvestIds),
        eq(harvests.orgId, ctx.org.id),
        eq(harvests.cropCycleId, lot.cropCycleId),
      ),
    );
  if (validHarvests.length !== new Set(harvestIds).size) {
    throw new Error(
      "one or more harvests are invalid for this lot (wrong org or cycle)",
    );
  }

  const inserted = await db
    .insert(harvestLotItems)
    .values(
      validHarvests.map((h) => ({
        id: newId(),
        orgId: ctx.org.id,
        lotId,
        harvestId: h.id,
      })),
    )
    .onConflictDoNothing({ target: harvestLotItems.harvestId })
    .returning();

  return { requested: harvestIds.length, attached: inserted.length };
}

export async function removeHarvestFromLot(
  ctx: OrgContext,
  lotId: string,
  harvestId: string,
) {
  assertCan(ctx, "processing", "manage");
  await assertOrgFeature(ctx.org.id, FEATURE);
  const lot = await requireLotInOrg(ctx, lotId);
  if (lot.status !== "open") throw new Error("harvest lot is closed");

  await db
    .delete(harvestLotItems)
    .where(
      and(
        eq(harvestLotItems.lotId, lotId),
        eq(harvestLotItems.harvestId, harvestId),
        eq(harvestLotItems.orgId, ctx.org.id),
      ),
    );
}

export async function closeLot(ctx: OrgContext, lotId: string) {
  assertCan(ctx, "processing", "manage");
  await assertOrgFeature(ctx.org.id, FEATURE);
  const lot = await requireLotInOrg(ctx, lotId);
  if (lot.status !== "open") throw new Error("harvest lot is already closed");

  const [updated] = await db
    .update(harvestLots)
    .set({ status: "closed" })
    .where(and(eq(harvestLots.id, lotId), eq(harvestLots.orgId, ctx.org.id)))
    .returning();
  return updated;
}

// ---------------------------------------------------------------------------
// Processing runs
// ---------------------------------------------------------------------------

export type RunCreateInput = {
  cropCycleId: string;
  harvestLotId?: string | null;
  date: string;
  inputQuantity: string;
  inputUnit: string;
  outputQuantity: string;
  outputUnit: string;
  cost?: string;
  notes?: string | null;
};

export async function createRun(ctx: OrgContext, input: RunCreateInput) {
  assertCan(ctx, "processing", "manage");
  await assertOrgFeature(ctx.org.id, FEATURE);

  const [cycle] = await db
    .select({ id: cropCycles.id })
    .from(cropCycles)
    .where(
      and(
        eq(cropCycles.id, input.cropCycleId),
        eq(cropCycles.orgId, ctx.org.id),
      ),
    )
    .limit(1);
  if (!cycle) throw new Error("crop cycle not found");

  if (input.harvestLotId) {
    const [lot] = await db
      .select({ id: harvestLots.id })
      .from(harvestLots)
      .where(
        and(
          eq(harvestLots.id, input.harvestLotId),
          eq(harvestLots.orgId, ctx.org.id),
          eq(harvestLots.cropCycleId, input.cropCycleId),
        ),
      )
      .limit(1);
    if (!lot) throw new Error("harvest lot not found for this cycle");
  }

  const [created] = await db
    .insert(processingRuns)
    .values({
      id: newId(),
      orgId: ctx.org.id,
      cropCycleId: input.cropCycleId,
      harvestLotId: input.harvestLotId ?? null,
      date: input.date,
      inputQuantity: input.inputQuantity,
      inputUnit: input.inputUnit,
      outputQuantity: input.outputQuantity,
      outputUnit: input.outputUnit,
      cost: input.cost ?? "0",
      notes: input.notes ?? null,
      createdBy: ctx.user.id,
    })
    .returning();
  return created;
}

export async function listRuns(
  ctx: OrgContext,
  filter?: { cropCycleId?: string },
) {
  return db
    .select({
      run: processingRuns,
      cycleName: cropCycles.name,
      lotName: harvestLots.name,
    })
    .from(processingRuns)
    .innerJoin(cropCycles, eq(processingRuns.cropCycleId, cropCycles.id))
    .leftJoin(harvestLots, eq(processingRuns.harvestLotId, harvestLots.id))
    .where(
      and(
        eq(processingRuns.orgId, ctx.org.id),
        filter?.cropCycleId
          ? eq(processingRuns.cropCycleId, filter.cropCycleId)
          : undefined,
      ),
    )
    .orderBy(desc(processingRuns.date));
}

export async function deleteRun(ctx: OrgContext, id: string) {
  assertCan(ctx, "processing", "manage");
  await assertOrgFeature(ctx.org.id, FEATURE);
  await db
    .delete(processingRuns)
    .where(and(eq(processingRuns.id, id), eq(processingRuns.orgId, ctx.org.id)));
}
