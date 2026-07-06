import {
  boolean,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { activities } from "./activities";
import { workers } from "./labor";
import { user } from "./auth";
import { id, orgId, timestamps } from "./helpers";

const money = (name: string) => numeric(name, { precision: 14, scale: 4 });

export const machines = pgTable(
  "machines",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    code: text("code"),
    category: text("category"),
    brand: text("brand"),
    model: text("model"),
    year: integer("year"),
    // Current operating cost per hour; snapshotted onto each usage log.
    hourlyCost: money("hourly_cost").notNull().default("0"),
    active: boolean("active").notNull().default(true),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("machines_org_idx").on(t.orgId)],
);

export const machineUsageLogs = pgTable(
  "machine_usage_logs",
  {
    id: id(),
    orgId: orgId(),
    machineId: uuid("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "cascade" }),
    activityId: uuid("activity_id").references(() => activities.id, {
      onDelete: "set null",
    }),
    // Plain uuid (validated org-scoped in the service) — a DB FK here would
    // create a module cycle with workorders.ts, which imports machines.
    workOrderId: uuid("work_order_id"),
    operatorWorkerId: uuid("operator_worker_id").references(() => workers.id, {
      onDelete: "set null",
    }),
    date: date("date").notNull(),
    hoursUsed: numeric("hours_used", { precision: 8, scale: 2 })
      .notNull()
      .default("0"),
    fuelLiters: numeric("fuel_liters", { precision: 10, scale: 2 }),
    fuelCost: money("fuel_cost").notNull().default("0"),
    // Rate frozen at capture so later machine-rate edits don't rewrite history.
    hourlyCostSnapshot: money("hourly_cost_snapshot").notNull().default("0"),
    // hours × hourlyCostSnapshot + fuelCost, recomputed server-side.
    totalCost: money("total_cost").notNull().default("0"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id),
    ...timestamps,
  },
  (t) => [
    index("machine_usage_org_machine_idx").on(t.orgId, t.machineId),
    index("machine_usage_org_date_idx").on(t.orgId, t.date),
  ],
);
