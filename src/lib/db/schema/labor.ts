import { sql } from "drizzle-orm";
import {
  boolean,
  check,
  date,
  foreignKey,
  index,
  numeric,
  pgTable,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { farms } from "./farms";
import { cropCycles } from "./crops";
import { user } from "./auth";
import { id, orgId, orgIsolationPolicy, timestamps } from "./helpers";

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
  (t) => [
    index("workers_org_idx").on(t.orgId),
    uniqueIndex("workers_org_code_uq")
      .on(t.orgId, t.code)
      .where(sql`${t.code} IS NOT NULL`),
    check("workers_daily_rate_nonneg_check", sql`${t.dailyRate} >= 0`),
    check("workers_hourly_rate_nonneg_check", sql`${t.hourlyRate} >= 0`),
    check("workers_type_check", sql`${t.type} IN ('fixed', 'temporary')`),
    ...orgIsolationPolicy("workers"),
  ],
).enableRLS();

export const attendanceRecords = pgTable(
  "attendance_records",
  {
    id: id(),
    orgId: orgId(),
    // Financial/ledger row: a worker delete must not erase attendance
    // history, so this is RESTRICT, not CASCADE (workers are soft-deleted).
    workerId: uuid("worker_id")
      .notNull()
      .references(() => workers.id, { onDelete: "no action" }),
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
    check(
      "attendance_records_status_check",
      sql`${t.status} IN ('present', 'half_day', 'absent', 'sick', 'leave')`,
    ),
    check(
      "attendance_records_hours_worked_nonneg_check",
      sql`${t.hoursWorked} IS NULL OR ${t.hoursWorked} >= 0`,
    ),
    check(
      "attendance_records_daily_rate_nonneg_check",
      sql`${t.dailyRateSnapshot} >= 0`,
    ),
    check(
      "attendance_records_hourly_rate_nonneg_check",
      sql`${t.hourlyRateSnapshot} >= 0`,
    ),
    ...orgIsolationPolicy("attendance_records"),
  ],
).enableRLS();

/** Piecework tariffs: pay per unit of work (lata cut, surco weeded…). */
export const pieceRates = pgTable(
  "piece_rates",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    unit: text("unit").notNull().default("unidad"),
    rate: money("rate").notNull().default("0"),
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("piece_rates_org_idx").on(t.orgId),
    uniqueIndex("piece_rates_org_name_uq").on(t.orgId, t.name),
    check("piece_rates_rate_nonneg_check", sql`${t.rate} >= 0`),
    // Lets children add a composite (org_id, piece_rate_id) FK so a
    // cross-tenant reference is impossible at the DB level.
    unique("piece_rates_org_id_uq").on(t.orgId, t.id),
    ...orgIsolationPolicy("piece_rates"),
  ],
).enableRLS();

/** One captured piecework quantity; amount = quantity × rate snapshot. */
export const pieceworkEntries = pgTable(
  "piecework_entries",
  {
    id: id(),
    orgId: orgId(),
    // Financial/ledger row: a worker delete must not erase piecework
    // history, so this is RESTRICT, not CASCADE (workers are soft-deleted).
    workerId: uuid("worker_id")
      .notNull()
      .references(() => workers.id, { onDelete: "no action" }),
    pieceRateId: uuid("piece_rate_id")
      .notNull()
      .references(() => pieceRates.id),
    // Optional attribution to a crop cycle so piecework labor flows into
    // per-cycle profitability; unattributed entries stay an org-wide line.
    cropCycleId: uuid("crop_cycle_id").references(() => cropCycles.id, {
      onDelete: "set null",
    }),
    date: date("date").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull(),
    // Rate frozen at capture so later tariff edits don't rewrite history.
    rateSnapshot: money("rate_snapshot").notNull().default("0"),
    amount: money("amount").notNull().default("0"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id),
    ...timestamps,
  },
  (t) => [
    index("piecework_org_worker_date_idx").on(t.orgId, t.workerId, t.date),
    index("piecework_org_date_idx").on(t.orgId, t.date),
    index("piecework_entries_org_cycle_idx").on(t.orgId, t.cropCycleId),
    // Additional guard alongside the single-column pieceRateId FK above:
    // makes a cross-tenant piece-rate reference impossible at the DB level.
    foreignKey({
      columns: [t.orgId, t.pieceRateId],
      foreignColumns: [pieceRates.orgId, pieceRates.id],
    }).onDelete("no action"),
    ...orgIsolationPolicy("piecework_entries"),
  ],
).enableRLS();

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
    closedAt: timestamp("closed_at", { withTimezone: true }),
    // Denormalized sum of entry net amounts, in the org base currency.
    totalAmount: money("total_amount").notNull().default("0"),
    currencyCode: text("currency_code").notNull().default("USD"),
    createdBy: text("created_by").references(() => user.id),
    ...timestamps,
  },
  (t) => [
    index("payroll_periods_org_idx").on(t.orgId, t.startDate),
    check(
      "payroll_periods_status_check",
      sql`${t.status} IN ('open', 'closed')`,
    ),
    check(
      "payroll_periods_date_range_check",
      sql`${t.endDate} >= ${t.startDate}`,
    ),
    check(
      "payroll_periods_currency_code_check",
      sql`char_length(${t.currencyCode}) = 3`,
    ),
    ...orgIsolationPolicy("payroll_periods"),
  ],
).enableRLS();

export const payrollEntries = pgTable(
  "payroll_entries",
  {
    id: id(),
    orgId: orgId(),
    periodId: uuid("period_id")
      .notNull()
      .references(() => payrollPeriods.id, { onDelete: "cascade" }),
    // Financial/ledger row: a worker delete must not erase payroll history,
    // so this is RESTRICT, not CASCADE (workers are soft-deleted).
    workerId: uuid("worker_id")
      .notNull()
      .references(() => workers.id, { onDelete: "no action" }),
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
    createdBy: text("created_by").references(() => user.id),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("payroll_entries_period_worker_uq").on(t.periodId, t.workerId),
    index("payroll_entries_org_idx").on(t.orgId),
    index("payroll_entries_worker_idx").on(t.workerId),
    ...orgIsolationPolicy("payroll_entries"),
  ],
).enableRLS();
