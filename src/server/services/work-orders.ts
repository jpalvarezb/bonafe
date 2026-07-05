import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@/lib/db";
import { member, parcels, user, workOrders } from "@/lib/db/schema";
import type { OrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { newId } from "@/lib/ids";

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
  assignedToMemberId?: string | null;
  scheduledDate?: string | null;
  instructions?: string | null;
};

export async function listWorkOrders(
  ctx: OrgContext,
  filter?: { status?: WorkOrderStatus },
) {
  return db
    .select({
      workOrder: workOrders,
      parcelName: parcels.name,
      assigneeName: user.name,
    })
    .from(workOrders)
    .leftJoin(parcels, eq(workOrders.parcelId, parcels.id))
    .leftJoin(member, eq(workOrders.assignedToMemberId, member.id))
    .leftJoin(user, eq(member.userId, user.id))
    .where(
      and(
        eq(workOrders.orgId, ctx.org.id),
        filter?.status ? eq(workOrders.status, filter.status) : undefined,
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

  if (input.parcelId) await assertParcelInOrg(ctx, input.parcelId);
  if (input.assignedToMemberId) {
    await assertMemberInOrg(ctx, input.assignedToMemberId);
  }

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
          instructions: input.instructions ?? null,
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

  const [updated] = await db
    .update(workOrders)
    .set({ status })
    .where(and(eq(workOrders.id, id), eq(workOrders.orgId, ctx.org.id)))
    .returning();
  return updated;
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
