import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  integer,
  numeric,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { farms, parcels } from "./farms";
import { cropCycles } from "./crops";
import { activityTypes, products } from "./catalog";
import { costCenters } from "./workorders";
import { workers } from "./labor";
import { user } from "./auth";
import { id, orgId, orgIsolationPolicy, timestamps } from "./helpers";

const money = (name: string) => numeric(name, { precision: 14, scale: 4 });

export const activities = pgTable(
  "activities",
  {
    id: id(),
    orgId: orgId(),
    // Financial ledger row: a farm/parcel delete must not silently erase
    // activity cost history, so these are RESTRICT, not CASCADE.
    farmId: uuid("farm_id").references(() => farms.id, {
      onDelete: "no action",
    }),
    // NULL parcel = general (non-parcel) activity, Tier 2
    parcelId: uuid("parcel_id").references(() => parcels.id, {
      onDelete: "no action",
    }),
    cropCycleId: uuid("crop_cycle_id").references(() => cropCycles.id, {
      onDelete: "set null",
    }),
    costCenterId: uuid("cost_center_id").references(() => costCenters.id, {
      onDelete: "set null",
    }),
    activityTypeId: uuid("activity_type_id")
      .notNull()
      .references(() => activityTypes.id),
    date: date("date").notNull(),
    description: text("description"),
    status: text("status", { enum: ["done", "in_progress"] })
      .notNull()
      .default("done"),
    laborCost: money("labor_cost").notNull().default("0"),
    inputCost: money("input_cost").notNull().default("0"),
    machineCost: money("machine_cost").notNull().default("0"),
    otherCost: money("other_cost").notNull().default("0"),
    // Denormalized sum of the four cost components; recomputed by the service.
    totalCost: money("total_cost").notNull().default("0"),
    currencyCode: text("currency_code").notNull().default("USD"),
    // Snapshot: multiply total_cost by this to get org base currency.
    exchangeRate: numeric("exchange_rate", { precision: 18, scale: 8 })
      .notNull()
      .default("1"),
    createdBy: text("created_by").references(() => user.id),
    createdOffline: boolean("created_offline").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("activities_org_date_idx").on(t.orgId, t.date),
    index("activities_org_parcel_idx").on(t.orgId, t.parcelId),
    index("activities_org_cycle_idx").on(t.orgId, t.cropCycleId),
    index("activities_farm_idx").on(t.farmId),
    index("activities_activity_type_idx").on(t.activityTypeId),
    index("activities_cost_center_idx").on(t.costCenterId),
    check(
      "activities_currency_code_check",
      sql`char_length(${t.currencyCode}) = 3`,
    ),
    check(
      "activities_status_check",
      sql`${t.status} IN ('done', 'in_progress')`,
    ),
    ...orgIsolationPolicy("activities"),
  ],
).enableRLS();

export const activityInputs = pgTable(
  "activity_inputs",
  {
    id: id(),
    orgId: orgId(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull(),
    unitCost: money("unit_cost").notNull().default("0"),
    total: money("total").notNull().default("0"),
    ...timestamps,
  },
  (t) => [
    index("activity_inputs_activity_idx").on(t.activityId),
    // Additional guard alongside the single-column productId FK above: makes
    // a cross-tenant product reference impossible at the DB level.
    foreignKey({
      columns: [t.orgId, t.productId],
      foreignColumns: [products.orgId, products.id],
    }).onDelete("no action"),
    ...orgIsolationPolicy("activity_inputs"),
  ],
).enableRLS();

export const activityLabor = pgTable(
  "activity_labor",
  {
    id: id(),
    orgId: orgId(),
    activityId: uuid("activity_id")
      .notNull()
      .references(() => activities.id, { onDelete: "cascade" }),
    workerId: uuid("worker_id").references(() => workers.id, {
      onDelete: "set null",
    }),
    // Free-text crew label when no registered worker is linked.
    workerName: text("worker_name"),
    workersCount: integer("workers_count").notNull().default(1),
    hours: numeric("hours", { precision: 8, scale: 2 }),
    rateType: text("rate_type", {
      enum: ["daily", "hourly", "piecework"],
    })
      .notNull()
      .default("daily"),
    rate: money("rate").notNull().default("0"),
    amount: money("amount").notNull().default("0"),
    ...timestamps,
  },
  (t) => [
    index("activity_labor_activity_idx").on(t.activityId),
    check(
      "activity_labor_rate_type_check",
      sql`${t.rateType} IN ('daily', 'hourly', 'piecework')`,
    ),
    check("activity_labor_hours_nonneg_check", sql`${t.hours} IS NULL OR ${t.hours} >= 0`),
    check("activity_labor_rate_nonneg_check", sql`${t.rate} >= 0`),
    check("activity_labor_amount_nonneg_check", sql`${t.amount} >= 0`),
    ...orgIsolationPolicy("activity_labor"),
  ],
).enableRLS();
