import {
  date,
  index,
  jsonb,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { parcels } from "./farms";
import { machines } from "./machinery";
import { member } from "./tenancy";
import { id, orgId, timestamps } from "./helpers";

export const costCenters = pgTable(
  "cost_centers",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    parentId: uuid("parent_id").references((): AnyPgColumn => costCenters.id, {
      onDelete: "set null",
    }),
    ...timestamps,
  },
  (t) => [index("cost_centers_org_idx").on(t.orgId)],
);

export const workOrders = pgTable(
  "work_orders",
  {
    id: id(),
    orgId: orgId(),
    code: text("code").notNull(),
    title: text("title").notNull(),
    type: text("type", { enum: ["field", "machine"] })
      .notNull()
      .default("field"),
    status: text("status", {
      enum: ["draft", "assigned", "in_progress", "done", "cancelled"],
    })
      .notNull()
      .default("draft"),
    assignedToMemberId: text("assigned_to_member_id").references(
      () => member.id,
      { onDelete: "set null" },
    ),
    scheduledDate: date("scheduled_date"),
    parcelId: uuid("parcel_id").references(() => parcels.id, {
      onDelete: "set null",
    }),
    // Machine work orders (type "machine") assign the machine here.
    machineId: uuid("machine_id").references((): AnyPgColumn => machines.id, {
      onDelete: "set null",
    }),
    instructions: text("instructions"),
    // Tier 3 advanced config (checklists, targets) lands here later.
    config: jsonb("config").notNull().default({}),
    ...timestamps,
  },
  (t) => [
    index("work_orders_org_status_idx").on(t.orgId, t.status),
    index("work_orders_org_assignee_idx").on(t.orgId, t.assignedToMemberId),
    uniqueIndex("work_orders_org_code_uq").on(t.orgId, t.code),
  ],
);
