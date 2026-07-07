import { and, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { withOrgRls, type Tx } from "@/lib/db/rls";
import { machines, member, parcels, user, workOrders } from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { assertOrgFeature } from "@/lib/plan-limits";
import { newId } from "@/lib/ids";
import { mergeChecklistCompletion } from "@/lib/calc/work-order-checklist";

export { mergeChecklistCompletion } from "@/lib/calc/work-order-checklist";

const checklistItemSchema = z.object({
  id: z.string().min(1),
  label: z.string().min(1).max(200),
  done: z.boolean(),
});

const checklistSchema = z.object({
  checklist: z.array(checklistItemSchema).max(20),
});

export type ChecklistItem = z.infer<typeof checklistItemSchema>;

/** Tolerant parse: any legacy/malformed config lands on an empty checklist. */
export function parseChecklist(config: unknown): ChecklistItem[] {
  const result = checklistSchema.safeParse(config);
  return result.success ? result.data.checklist : [];
}

export type WorkOrderStatus =
  | "draft"
  | "assigned"
  | "in_progress"
  | "done"
  | "cancelled";

/** Server-side transition map; the UI mirrors this but must not be trusted. */
const ALLOWED_TRANSITIONS: Record<WorkOrderStatus, WorkOrderStatus[]> = {
  draft: ["assigned", "cancelled"],
  assigned: ["in_progress", "cancelled"],
  in_progress: ["done", "cancelled"],
  done: [],
  cancelled: [],
};

export type WorkOrderInput = {
  title: string;
  type: "field" | "machine";
  parcelId?: string | null;
  machineId?: string | null;
  assignedToMemberId?: string | null;
  scheduledDate?: string | null;
  instructions?: string | null;
  /** Pre-built checklist items (id/label/done) — see actions/work-orders.ts. */
  checklist?: ChecklistItem[];
};

export async function listWorkOrders(
  ctx: OrgContext,
  filter?: { status?: WorkOrderStatus; excludeCancelled?: boolean },
) {
  return withOrgRls(ctx.org.id, (tx) =>
    tx
      .select({
        workOrder: workOrders,
        parcelName: parcels.name,
        assigneeName: user.name,
        machineName: machines.name,
      })
      .from(workOrders)
      .leftJoin(parcels, eq(workOrders.parcelId, parcels.id))
      .leftJoin(member, eq(workOrders.assignedToMemberId, member.id))
      .leftJoin(user, eq(member.userId, user.id))
      .leftJoin(machines, eq(workOrders.machineId, machines.id))
      .where(
        and(
          eq(workOrders.orgId, ctx.org.id),
          filter?.status ? eq(workOrders.status, filter.status) : undefined,
          filter?.excludeCancelled
            ? ne(workOrders.status, "cancelled")
            : undefined,
        ),
      )
      .orderBy(desc(workOrders.createdAt)),
  );
}

async function assertParcelInOrg(tx: Tx, ctx: OrgContext, parcelId: string) {
  const [row] = await tx
    .select({ id: parcels.id })
    .from(parcels)
    .where(and(eq(parcels.id, parcelId), eq(parcels.orgId, ctx.org.id)))
    .limit(1);
  if (!row) throw new Error("parcel not found");
}

async function assertMachineInOrg(tx: Tx, ctx: OrgContext, machineId: string) {
  const [row] = await tx
    .select({ id: machines.id })
    .from(machines)
    .where(and(eq(machines.id, machineId), eq(machines.orgId, ctx.org.id)))
    .limit(1);
  if (!row) throw new Error("machine not found");
}

async function assertMemberInOrg(tx: Tx, ctx: OrgContext, memberId: string) {
  const [row] = await tx
    .select({ id: member.id })
    .from(member)
    .where(
      and(eq(member.id, memberId), eq(member.organizationId, ctx.org.id)),
    )
    .limit(1);
  if (!row) throw new Error("member not found");
}

/** Next code from the current max, e.g. OT-0007 → OT-0008. */
async function nextWorkOrderCode(tx: Tx, ctx: OrgContext): Promise<string> {
  const [row] = await tx
    .select({
      maxNum: sql<number>`coalesce(max(nullif(substring(${workOrders.code} from 4), '')::int), 0)`,
    })
    .from(workOrders)
    .where(eq(workOrders.orgId, ctx.org.id));
  return `OT-${String((row?.maxNum ?? 0) + 1).padStart(4, "0")}`;
}

export async function createWorkOrder(ctx: OrgContext, input: WorkOrderInput) {
  assertCan(ctx, "work_order", "create");

  // Machine work orders exercise the machinery module even when no specific
  // machine is picked yet, so they're gated the same as machine CRUD/logs.
  if (input.type === "machine") {
    await assertOrgFeature(ctx.org.id, "machinery");
  } else {
    // A machine only makes sense on machine-type orders; dropping it here
    // also keeps field orders usable after a plan downgrade.
    input.machineId = null;
  }

  const checklist = checklistSchema.parse({
    checklist: input.checklist ?? [],
  });

  return withOrgRls(ctx.org.id, async (tx) => {
    if (input.parcelId) await assertParcelInOrg(tx, ctx, input.parcelId);
    if (input.machineId) await assertMachineInOrg(tx, ctx, input.machineId);
    if (input.assignedToMemberId) {
      await assertMemberInOrg(tx, ctx, input.assignedToMemberId);
    }

    // Retry on the (org_id, code) unique index in case of concurrent creates.
    for (let attempt = 0; ; attempt++) {
      const code = await nextWorkOrderCode(tx, ctx);
      try {
        const [created] = await tx
          .insert(workOrders)
          .values({
            id: newId(),
            orgId: ctx.org.id,
            code,
            title: input.title,
            type: input.type,
            status: input.assignedToMemberId ? "assigned" : "draft",
            assignedToMemberId: input.assignedToMemberId ?? null,
            scheduledDate: input.scheduledDate ?? null,
            parcelId: input.parcelId ?? null,
            machineId: input.machineId ?? null,
            instructions: input.instructions ?? null,
            config: checklist,
          })
          .returning();
        return created;
      } catch (error) {
        const isUniqueViolation =
          error instanceof Error &&
          "code" in error &&
          (error as { code?: string }).code === "23505";
        if (!isUniqueViolation || attempt >= 3) throw error;
      }
    }
  });
}

export async function updateWorkOrderStatus(
  ctx: OrgContext,
  id: string,
  status: WorkOrderStatus,
) {
  assertCan(ctx, "work_order", status === "done" ? "complete" : "update");

  // Row lock: the transition check must not run against a stale read, or a
  // cancel racing completeWorkOrder (which locks this same row) could
  // validate against the pre-completion status and then overwrite "done"
  // with "cancelled" — a state the transition map forbids.
  return withOrgRls(ctx.org.id, async (tx) => {
    const [current] = await tx
      .select({
        status: workOrders.status,
        assignedToMemberId: workOrders.assignedToMemberId,
        config: workOrders.config,
      })
      .from(workOrders)
      .where(and(eq(workOrders.id, id), eq(workOrders.orgId, ctx.org.id)))
      .limit(1)
      .for("update");
    if (!current) throw new Error("work order not found");

    const allowed = ALLOWED_TRANSITIONS[current.status as WorkOrderStatus];
    if (!allowed.includes(status)) {
      throw new Error(`invalid transition ${current.status} -> ${status}`);
    }
    if (status === "assigned" && !current.assignedToMemberId) {
      throw new Error("cannot assign a work order without an assignee");
    }
    if (status === "done") {
      const checklist = parseChecklist(current.config);
      if (checklist.some((item) => !item.done)) {
        throw new Error("checklist incomplete");
      }
    }

    const [updated] = await tx
      .update(workOrders)
      .set({ status })
      .where(and(eq(workOrders.id, id), eq(workOrders.orgId, ctx.org.id)))
      .returning();
    return updated;
  });
}

const CHECKLIST_TOGGLE_STATUSES: WorkOrderStatus[] = ["assigned", "in_progress"];

/**
 * Checks/unchecks a single checklist item. Field supervisors ("complete"
 * permission) may toggle items only while the order is assigned or in
 * progress — not on draft, done, or cancelled orders.
 */
export async function toggleChecklistItem(
  ctx: OrgContext,
  workOrderId: string,
  itemId: string,
  done: boolean,
) {
  assertCan(ctx, "work_order", "complete");

  // Locked read-modify-write: the config jsonb is rewritten whole, so two
  // supervisors toggling different items concurrently must serialize here or
  // the second write would silently drop the first toggle.
  return withOrgRls(ctx.org.id, async (tx) => {
    const [current] = await tx
      .select({ status: workOrders.status, config: workOrders.config })
      .from(workOrders)
      .where(
        and(eq(workOrders.id, workOrderId), eq(workOrders.orgId, ctx.org.id)),
      )
      .limit(1)
      .for("update");
    if (!current) throw new Error("work order not found");
    if (!CHECKLIST_TOGGLE_STATUSES.includes(current.status as WorkOrderStatus)) {
      throw new Error("checklist can only change while assigned or in progress");
    }

    const checklist = parseChecklist(current.config);
    const item = checklist.find((entry) => entry.id === itemId);
    if (!item) throw new Error("checklist item not found");
    item.done = done;

    const [updated] = await tx
      .update(workOrders)
      .set({ config: checklistSchema.parse({ checklist }) })
      .where(
        and(eq(workOrders.id, workOrderId), eq(workOrders.orgId, ctx.org.id)),
      )
      .returning();
    return updated;
  });
}

/**
 * Single field-completion operation for the offline outbox
 * ("workorder.complete"): checks off the given items and transitions the
 * order straight to "done" in one transactional step. Replay-safe and
 * lock-safe so it can be applied idempotently from a queued/retried sync
 * batch, and so it doesn't race `toggleChecklistItem` or a concurrent
 * completion from another device.
 *
 * Deliberate design choice, distinct from `updateWorkOrderStatus`: a field
 * crew captures completion from the field, often having gone straight from
 * "assigned" to finishing the job without ever separately marking
 * "in_progress" online. So this path allows assigned -> done directly,
 * collapsing the assigned -> in_progress -> done chain into one operation.
 * `updateWorkOrderStatus` is untouched and still requires the normal
 * step-by-step transition for the online status-change UI.
 */
export async function completeWorkOrder(
  ctx: OrgContext,
  input: { workOrderId: string; checkedItemIds: readonly string[] },
): Promise<{
  workOrder: typeof workOrders.$inferSelect;
  transitioned: boolean;
}> {
  assertCan(ctx, "work_order", "complete");

  return withOrgRls(ctx.org.id, async (tx) => {
    // Row lock: config jsonb is rewritten whole below, so this must
    // serialize against toggleChecklistItem and concurrent completions the
    // same way toggleChecklistItem locks against itself (previously,
    // updateWorkOrderStatus's completeness check ran unlocked against this
    // same config column — this path fixes that race for its own writes).
    const [current] = await tx
      .select()
      .from(workOrders)
      .where(
        and(eq(workOrders.id, input.workOrderId), eq(workOrders.orgId, ctx.org.id)),
      )
      .limit(1)
      .for("update");
    if (!current) throw new Error("work order not found");

    // Replay no-op: "done" is terminal, so a replayed completion (outbox
    // retry, duplicate flush) is success, not an error — no write needed.
    if (current.status === "done") {
      return { workOrder: current, transitioned: false };
    }

    const status = current.status as WorkOrderStatus;
    if (status !== "assigned" && status !== "in_progress") {
      throw new Error(`invalid transition ${status} -> done`);
    }

    const checklist = parseChecklist(current.config);
    const merged = mergeChecklistCompletion(checklist, input.checkedItemIds);
    if (merged.some((item) => !item.done)) {
      throw new Error("checklist incomplete");
    }

    const [updated] = await tx
      .update(workOrders)
      .set({
        config: checklistSchema.parse({ checklist: merged }),
        status: "done",
      })
      .where(
        and(eq(workOrders.id, input.workOrderId), eq(workOrders.orgId, ctx.org.id)),
      )
      .returning();
    return { workOrder: updated, transitioned: true };
  });
}

export async function deleteWorkOrder(ctx: OrgContext, id: string) {
  assertCan(ctx, "work_order", "delete");
  await withOrgRls(ctx.org.id, (tx) =>
    tx
      .delete(workOrders)
      .where(and(eq(workOrders.id, id), eq(workOrders.orgId, ctx.org.id))),
  );
}

/** Org members joined with their user record, for assignee selection. */
export async function listMembers(ctx: OrgContext) {
  return withOrgRls(ctx.org.id, (tx) =>
    tx
      .select({
        id: member.id,
        name: user.name,
      })
      .from(member)
      .innerJoin(user, eq(member.userId, user.id))
      .where(eq(member.organizationId, ctx.org.id))
      .orderBy(user.name),
  );
}
