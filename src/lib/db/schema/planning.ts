import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { farms, parcels } from "./farms";
import { cropCycles } from "./crops";
import { activities } from "./activities";
import { activityTypes } from "./catalog";
import { user } from "./auth";
import { id, orgId, timestamps } from "./helpers";

const money = (name: string) => numeric(name, { precision: 14, scale: 4 });

/** Calendar-planned work; converting creates a real activity and links it. */
export const plannedActivities = pgTable(
  "planned_activities",
  {
    id: id(),
    orgId: orgId(),
    farmId: uuid("farm_id").references(() => farms.id, {
      onDelete: "cascade",
    }),
    parcelId: uuid("parcel_id").references(() => parcels.id, {
      onDelete: "cascade",
    }),
    cropCycleId: uuid("crop_cycle_id").references(() => cropCycles.id, {
      onDelete: "set null",
    }),
    activityTypeId: uuid("activity_type_id")
      .notNull()
      .references(() => activityTypes.id),
    plannedDate: date("planned_date").notNull(),
    description: text("description"),
    estimatedCost: money("estimated_cost").notNull().default("0"),
    status: text("status", {
      enum: ["planned", "converted", "cancelled"],
    })
      .notNull()
      .default("planned"),
    convertedActivityId: uuid("converted_activity_id").references(
      () => activities.id,
      { onDelete: "set null" },
    ),
    createdBy: text("created_by").references(() => user.id),
    ...timestamps,
  },
  (t) => [index("planned_activities_org_date_idx").on(t.orgId, t.plannedDate)],
);

export const budgets = pgTable(
  "budgets",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    year: integer("year").notNull(),
    // Optional scoping: budget for one farm and/or one crop cycle.
    farmId: uuid("farm_id").references(() => farms.id, { onDelete: "cascade" }),
    cropCycleId: uuid("crop_cycle_id").references(() => cropCycles.id, {
      onDelete: "set null",
    }),
    currencyCode: text("currency_code").notNull().default("USD"),
    status: text("status", { enum: ["draft", "active"] })
      .notNull()
      .default("active"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id),
    ...timestamps,
  },
  (t) => [index("budgets_org_idx").on(t.orgId, t.year)],
);

/** One amount per month × cost category; variance compares to activities. */
export const budgetLines = pgTable(
  "budget_lines",
  {
    id: id(),
    orgId: orgId(),
    budgetId: uuid("budget_id")
      .notNull()
      .references(() => budgets.id, { onDelete: "cascade" }),
    month: integer("month").notNull(), // 1..12
    category: text("category", {
      enum: ["labor", "input", "machine", "other"],
    }).notNull(),
    amount: money("amount").notNull().default("0"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("budget_lines_budget_month_cat_uq").on(
      t.budgetId,
      t.month,
      t.category,
    ),
  ],
);
