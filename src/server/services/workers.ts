import { and, asc, eq } from "drizzle-orm";
import { withOrgRls } from "@/lib/db/rls";
import { workers } from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { assertOrgFeature } from "@/lib/plan-limits";
import { newId } from "@/lib/ids";

export type WorkerInput = {
  name: string;
  code?: string | null;
  documentId?: string | null;
  phone?: string | null;
  type: "fixed" | "temporary";
  dailyRate?: string;
  hourlyRate?: string;
  notes?: string | null;
};

/** Full worker roster. Pass includeInactive to also show deactivated workers. */
export async function listWorkers(
  ctx: OrgContext,
  filter?: { includeInactive?: boolean },
) {
  return withOrgRls(ctx.org.id, (tx) =>
    tx
      .select()
      .from(workers)
      .where(
        and(
          eq(workers.orgId, ctx.org.id),
          filter?.includeInactive ? undefined : eq(workers.active, true),
        ),
      )
      .orderBy(asc(workers.name)),
  );
}

/** Active-only roster for the attendance grid. */
export async function listActiveWorkers(ctx: OrgContext) {
  return listWorkers(ctx, { includeInactive: false });
}

export async function getWorker(ctx: OrgContext, workerId: string) {
  return withOrgRls(ctx.org.id, async (tx) => {
    const [worker] = await tx
      .select()
      .from(workers)
      .where(and(eq(workers.id, workerId), eq(workers.orgId, ctx.org.id)))
      .limit(1);
    return worker ?? null;
  });
}

export async function createWorker(ctx: OrgContext, input: WorkerInput) {
  assertCan(ctx, "worker", "manage");
  await assertOrgFeature(ctx.org.id, "labor");
  return withOrgRls(ctx.org.id, async (tx) => {
    const [created] = await tx
      .insert(workers)
      .values({
        id: newId(),
        orgId: ctx.org.id,
        name: input.name,
        code: input.code ?? null,
        documentId: input.documentId ?? null,
        phone: input.phone ?? null,
        type: input.type,
        dailyRate: input.dailyRate ?? "0",
        hourlyRate: input.hourlyRate ?? "0",
        notes: input.notes ?? null,
      })
      .returning();
    return created;
  });
}

export async function updateWorker(
  ctx: OrgContext,
  workerId: string,
  input: Partial<WorkerInput>,
) {
  assertCan(ctx, "worker", "manage");
  await assertOrgFeature(ctx.org.id, "labor");
  return withOrgRls(ctx.org.id, async (tx) => {
    const [updated] = await tx
      .update(workers)
      .set(input)
      .where(and(eq(workers.id, workerId), eq(workers.orgId, ctx.org.id)))
      .returning();
    return updated;
  });
}

/** Soft toggle of active/inactive; workers are never hard-deleted. */
export async function setWorkerActive(
  ctx: OrgContext,
  workerId: string,
  active: boolean,
) {
  assertCan(ctx, "worker", "manage");
  await assertOrgFeature(ctx.org.id, "labor");
  return withOrgRls(ctx.org.id, async (tx) => {
    const [updated] = await tx
      .update(workers)
      .set({ active })
      .where(and(eq(workers.id, workerId), eq(workers.orgId, ctx.org.id)))
      .returning();
    return updated;
  });
}
