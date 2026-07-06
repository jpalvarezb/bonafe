import { and, desc, eq, ne, sql } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { machines, member, parcels, user, workOrders } from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { assertOrgFeature } from "@/lib/plan-limits";
import { newId } from "@/lib/ids";

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
  return db
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
    .orderBy(desc(workOrders.createdAt));
}

async function assertParcelInOrg(ctx: OrgContext, parcelId: string) {
  const [row] = await db
    .select({ id: parcels.id })
    .from(parcels)
    .where(and(eq(parcels.id, parcelId), eq(parcels.orgId, ctx.org.id)))
    .limit(1);
  if (!row) throw new Error("parcel not found");
}

async function assertMachineInOrg(ctx: OrgContext, machineId: string) {
  const [row] = await db
    .select({ id: machines.id })
    .from(machines)
    .where(and(eq(machines.id, machineId), eq(machines.orgId, ctx.org.id)))
    .limit(1);
  if (!row) throw new Error("machine not found");
}

async function assertMemberInOrg(ctx: OrgContext, memberId: string) {
  const [row] = await db
    .select({ id: member.id })
    .from(member)
    .where(
      and(eq(member.id, memberId), eq(member.organizationId, ctx.org.id)),
    )
    .limit(1);
  if (!row) throw new Error("member not found");
}

/** Next code from the current max, e.g. OT-0007 → OT-0008. */
async function nextWorkOrderCode(ctx: OrgContext): Promise<string> {
  const [row] = await db
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

  if (input.parcelId) await assertParcelInOrg(ctx, input.parcelId);
  if (input.machineId) await assertMachineInOrg(ctx, input.machineId);
  if (input.assignedToMemberId) {
    await assertMemberInOrg(ctx, input.assignedToMemberId);
  }

  const checklist = checklistSchema.parse({
    checklist: input.checklist ?? [],
  });

  // Retry on the (org_id, code) unique index in case of concurrent creates.
  for (let attempt = 0; ; attempt++) {
    const code = await nextWorkOrderCode(ctx);
    try {
      const [created] = await db
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
}

export async function updateWorkOrderStatus(
  ctx: OrgContext,
  id: string,
  status: WorkOrderStatus,
) {
  assertCan(ctx, "work_order", status === "done" ? "complete" : "update");

  const [current] = await db
    .select({
      status: workOrders.status,
      assignedToMemberId: workOrders.assignedToMemberId,
      config: workOrders.config,
    })
    .from(workOrders)
    .where(and(eq(workOrders.id, id), eq(workOrders.orgId, ctx.org.id)))
    .limit(1);
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

  const [updated] = await db
    .update(workOrders)
    .set({ status })
    .where(and(eq(workOrders.id, id), eq(workOrders.orgId, ctx.org.id)))
    .returning();
  return updated;
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
  return db.transaction(async (tx) => {
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

export async function deleteWorkOrder(ctx: OrgContext, id: string) {
  assertCan(ctx, "work_order", "delete");
  await db
    .delete(workOrders)
    .where(and(eq(workOrders.id, id), eq(workOrders.orgId, ctx.org.id)));
}

/** Org members joined with their user record, for assignee selection. */
export async function listMembers(ctx: OrgContext) {
  return db
    .select({
      id: member.id,
      name: user.name,
    })
    .from(member)
    .innerJoin(user, eq(member.userId, user.id))
    .where(eq(member.organizationId, ctx.org.id))
    .orderBy(user.name);
}
