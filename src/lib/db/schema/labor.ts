import {
  boolean,
  date,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { farms } from "./farms";
import { user } from "./auth";
import { id, orgId, timestamps } from "./helpers";

const money = (name: string) => numeric(name, { precision: 14, scale: 4 });

export const workers = pgTable(
  "workers",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    code: text("code"),
    documentId: text("document_id"),
    phone: text("phone"),
    type: text("type", { enum: ["fixed", "temporary"] })
      .notNull()
      .default("temporary"),
    // Rate snapshots are taken at capture time; these are the current rates.
    dailyRate: money("daily_rate").notNull().default("0"),
    hourlyRate: money("hourly_rate").notNull().default("0"),
    active: boolean("active").notNull().default(true),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("workers_org_idx").on(t.orgId)],
);

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: id(),
    orgId: orgId(),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => workers.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    status: text("status", {
      enum: ["present", "half_day", "absent", "sick", "leave"],
    })
      .notNull()
      .default("present"),
    // Extra/overtime hours beyond the day, paid at the hourly rate snapshot.
    hoursWorked: numeric("hours_worked", { precision: 6, scale: 2 }),
    // Rates frozen at capture so later worker-rate edits don't rewrite history.
    dailyRateSnapshot: money("daily_rate_snapshot").notNull().default("0"),
    hourlyRateSnapshot: money("hourly_rate_snapshot").notNull().default("0"),
    farmId: uuid("farm_id").references(() => farms.id, {
      onDelete: "set null",
    }),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id),
    createdOffline: boolean("created_offline").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    // One row per worker per day; offline dupes collapse via upsert.
    uniqueIndex("attendance_org_worker_date_uq").on(
      t.orgId,
      t.workerId,
      t.date,
    ),
    index("attendance_org_date_idx").on(t.orgId, t.date),
  ],
);

export const payrollPeriods = pgTable(
  "payroll_periods",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    startDate: date("start_date").notNull(),
    endDate: date("end_date").notNull(),
    status: text("status", { enum: ["open", "closed"] })
      .notNull()
      .default("open"),
    closedAt: timestamp("closed_at"),
    // Denormalized sum of entry net amounts, in the org base currency.
    totalAmount: money("total_amount").notNull().default("0"),
    currencyCode: text("currency_code").notNull().default("USD"),
    createdBy: text("created_by").references(() => user.id),
    ...timestamps,
  },
  (t) => [index("payroll_periods_org_idx").on(t.orgId, t.startDate)],
);

export const payrollEntries = pgTable(
  "payroll_entries",
  {
    id: id(),
    orgId: orgId(),
    periodId: uuid("period_id")
      .notNull()
      .references(() => payrollPeriods.id, { onDelete: "cascade" }),
    workerId: uuid("worker_id")
      .notNull()
      .references(() => workers.id, { onDelete: "cascade" }),
    // present = 1, half_day = 0.5
    daysWorked: numeric("days_worked", { precision: 6, scale: 2 })
      .notNull()
      .default("0"),
    hoursWorked: numeric("hours_worked", { precision: 8, scale: 2 })
      .notNull()
      .default("0"),
    baseAmount: money("base_amount").notNull().default("0"),
    overtimeAmount: money("overtime_amount").notNull().default("0"),
    pieceworkAmount: money("piecework_amount").notNull().default("0"),
    bonuses: money("bonuses").notNull().default("0"),
    deductions: money("deductions").notNull().default("0"),
    netAmount: money("net_amount").notNull().default("0"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("payroll_entries_period_worker_uq").on(t.periodId, t.workerId),
    index("payroll_entries_org_idx").on(t.orgId),
  ],
);
