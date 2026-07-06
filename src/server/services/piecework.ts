import { and, asc, between, desc, eq } from "drizzle-orm";
import Decimal from "decimal.js";
import { db } from "@/lib/db";
import { pieceRates, pieceworkEntries, workers } from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { assertOrgFeature } from "@/lib/plan-limits";
import { newId } from "@/lib/ids";

export type PieceRateInput = {
  name: string;
  unit: string;
  rate: string;
};

export type PieceworkEntryInput = {
  workerId: string;
  pieceRateId: string;
  date: string;
  quantity: string;
  notes?: string | null;
};

// ---------------------------------------------------------------------------
// Piece rates (tariffs) — top card CRUD
// ---------------------------------------------------------------------------

export async function listPieceRates(
  ctx: OrgContext,
  filter?: { activeOnly?: boolean },
) {
  return db
    .select()
    .from(pieceRates)
    .where(
      and(
        eq(pieceRates.orgId, ctx.org.id),
        filter?.activeOnly ? eq(pieceRates.active, true) : undefined,
      ),
    )
    .orderBy(asc(pieceRates.name));
}

export async function createPieceRate(ctx: OrgContext, input: PieceRateInput) {
  assertCan(ctx, "piecework", "manage");
  await assertOrgFeature(ctx.org.id, "payroll");
  const [created] = await db
    .insert(pieceRates)
    .values({
      id: newId(),
      orgId: ctx.org.id,
      name: input.name,
      unit: input.unit,
      rate: input.rate,
    })
    .returning();
  return created;
}

/** Soft toggle of active/inactive; rates are never hard-deleted (history). */
export async function setPieceRateActive(
  ctx: OrgContext,
  pieceRateId: string,
  active: boolean,
) {
  assertCan(ctx, "piecework", "manage");
  await assertOrgFeature(ctx.org.id, "payroll");
  const [updated] = await db
    .update(pieceRates)
    .set({ active })
    .where(
      and(eq(pieceRates.id, pieceRateId), eq(pieceRates.orgId, ctx.org.id)),
    )
    .returning();
  return updated;
}

// ---------------------------------------------------------------------------
// Active workers helper for the entry-capture select. The workers *service*
// is owned by another wave; this queries the shared workers table directly
// so this module doesn't reach into that ownership boundary.
// ---------------------------------------------------------------------------

export async function listActiveWorkersForPiecework(ctx: OrgContext) {
  return db
    .select({ id: workers.id, name: workers.name })
    .from(workers)
    .where(and(eq(workers.orgId, ctx.org.id), eq(workers.active, true)))
    .orderBy(asc(workers.name));
}

// ---------------------------------------------------------------------------
// Piecework entries
// ---------------------------------------------------------------------------

/**
 * Validates worker + rate belong to the org, snapshots the rate row, and
 * computes amount = quantity × rateSnapshot server-side — a client-supplied
 * amount is never trusted.
 */
export async function createPieceworkEntry(
  ctx: OrgContext,
  input: PieceworkEntryInput,
) {
  assertCan(ctx, "piecework", "create");
  await assertOrgFeature(ctx.org.id, "payroll");

  const [worker] = await db
    .select({ id: workers.id })
    .from(workers)
    .where(and(eq(workers.id, input.workerId), eq(workers.orgId, ctx.org.id)))
    .limit(1);
  if (!worker) throw new Error("worker not found");

  const [rate] = await db
    .select({ id: pieceRates.id, rate: pieceRates.rate })
    .from(pieceRates)
    .where(
      and(
        eq(pieceRates.id, input.pieceRateId),
        eq(pieceRates.orgId, ctx.org.id),
      ),
    )
    .limit(1);
  if (!rate) throw new Error("piece rate not found");

  const amount = new Decimal(input.quantity).mul(rate.rate).toFixed(4);

  const [created] = await db
    .insert(pieceworkEntries)
    .values({
      id: newId(),
      orgId: ctx.org.id,
      workerId: input.workerId,
      pieceRateId: input.pieceRateId,
      date: input.date,
      quantity: input.quantity,
      rateSnapshot: rate.rate,
      amount,
      notes: input.notes ?? null,
      createdBy: ctx.user.id,
    })
    .returning();
  return created;
}

/** Entries in [from, to], newest first, with worker + rate display fields. */
export async function listPieceworkEntries(
  ctx: OrgContext,
  range: { from: string; to: string },
) {
  return db
    .select({
      entry: pieceworkEntries,
      workerName: workers.name,
      rateName: pieceRates.name,
      unit: pieceRates.unit,
    })
    .from(pieceworkEntries)
    .innerJoin(workers, eq(pieceworkEntries.workerId, workers.id))
    .innerJoin(pieceRates, eq(pieceworkEntries.pieceRateId, pieceRates.id))
    .where(
      and(
        eq(pieceworkEntries.orgId, ctx.org.id),
        between(pieceworkEntries.date, range.from, range.to),
      ),
    )
    .orderBy(desc(pieceworkEntries.date));
}

export async function deletePieceworkEntry(ctx: OrgContext, entryId: string) {
  assertCan(ctx, "piecework", "delete");
  await assertOrgFeature(ctx.org.id, "payroll");
  await db
    .delete(pieceworkEntries)
    .where(
      and(
        eq(pieceworkEntries.id, entryId),
        eq(pieceworkEntries.orgId, ctx.org.id),
      ),
    );
}
