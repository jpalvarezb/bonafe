import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { activities } from "./activities";
import { workers } from "./labor";
import { workOrders } from "./workorders";
import { user } from "./auth";
import { id, orgId, orgIsolationPolicy, timestamps } from "./helpers";

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
  (t) => [
    index("machines_org_idx").on(t.orgId),
    uniqueIndex("machines_org_code_uq")
      .on(t.orgId, t.code)
      .where(sql`${t.code} IS NOT NULL`),
    ...orgIsolationPolicy("machines"),
  ],
).enableRLS();

export const machineUsageLogs = pgTable(
  "machine_usage_logs",
  {
    id: id(),
    orgId: orgId(),
    // Financial/ledger row: a machine delete must not erase usage-cost
    // history, so this is RESTRICT, not CASCADE.
    machineId: uuid("machine_id")
      .notNull()
      .references(() => machines.id, { onDelete: "no action" }),
    activityId: uuid("activity_id").references(() => activities.id, {
      onDelete: "set null",
    }),
    // Forward reference (workorders.ts imports machines from this module) —
    // same lazy-callback pattern as costCenters.parentId's self-reference.
    workOrderId: uuid("work_order_id").references(
      (): AnyPgColumn => workOrders.id,
      { onDelete: "set null" },
    ),
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
    index("machine_usage_logs_activity_idx").on(t.activityId),
    index("machine_usage_logs_work_order_idx").on(t.workOrderId),
    index("machine_usage_logs_operator_worker_idx").on(t.operatorWorkerId),
    check("machine_usage_logs_hours_used_nonneg_check", sql`${t.hoursUsed} >= 0`),
    check(
      "machine_usage_logs_fuel_liters_nonneg_check",
      sql`${t.fuelLiters} IS NULL OR ${t.fuelLiters} >= 0`,
    ),
    check("machine_usage_logs_fuel_cost_nonneg_check", sql`${t.fuelCost} >= 0`),
    check(
      "machine_usage_logs_hourly_cost_nonneg_check",
      sql`${t.hourlyCostSnapshot} >= 0`,
    ),
    check("machine_usage_logs_total_cost_nonneg_check", sql`${t.totalCost} >= 0`),
    ...orgIsolationPolicy("machine_usage_logs"),
  ],
).enableRLS();
