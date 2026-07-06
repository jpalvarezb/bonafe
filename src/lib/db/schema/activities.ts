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
import { farms, parcels } from "./farms";
import { cropCycles } from "./crops";
import { activityTypes, products } from "./catalog";
import { costCenters } from "./workorders";
import { workers } from "./labor";
import { user } from "./auth";
import { id, orgId, timestamps } from "./helpers";

const money = (name: string) => numeric(name, { precision: 14, scale: 4 });

export const activities = pgTable(
  "activities",
  {
    id: id(),
    orgId: orgId(),
    farmId: uuid("farm_id").references(() => farms.id, {
      onDelete: "cascade",
    }),
    // NULL parcel = general (non-parcel) activity, Tier 2
    parcelId: uuid("parcel_id").references(() => parcels.id, {
      onDelete: "cascade",
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
  ],
);

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
  (t) => [index("activity_inputs_activity_idx").on(t.activityId)],
);

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
  (t) => [index("activity_labor_activity_idx").on(t.activityId)],
);
