import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { cropCycles } from "./crops";
import { harvests } from "./harvests";
import { user } from "./auth";
import { id, orgId, timestamps } from "./helpers";

const money = (name: string) => numeric(name, { precision: 14, scale: 4 });
const qty = (name: string) => numeric(name, { precision: 14, scale: 4 });

/** Groups field harvests into a lot that then flows through processing. */
export const harvestLots = pgTable(
  "harvest_lots",
  {
    id: id(),
    orgId: orgId(),
    // Financial/ledger row: a cycle delete must not erase harvest-lot
    // history, so this is RESTRICT, not CASCADE.
    cropCycleId: uuid("crop_cycle_id")
      .notNull()
      .references(() => cropCycles.id, { onDelete: "no action" }),
    name: text("name").notNull(),
    status: text("status", { enum: ["open", "closed"] })
      .notNull()
      .default("open"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id),
    ...timestamps,
  },
  (t) => [index("harvest_lots_org_idx").on(t.orgId, t.cropCycleId)],
);

export const harvestLotItems = pgTable(
  "harvest_lot_items",
  {
    id: id(),
    orgId: orgId(),
    lotId: uuid("lot_id")
      .notNull()
      .references(() => harvestLots.id, { onDelete: "cascade" }),
    harvestId: uuid("harvest_id")
      .notNull()
      .references(() => harvests.id, { onDelete: "cascade" }),
    ...timestamps,
  },
  (t) => [
    // A harvest belongs to at most one lot.
    uniqueIndex("harvest_lot_items_harvest_uq").on(t.harvestId),
    index("harvest_lot_items_lot_idx").on(t.lotId),
  ],
);

/** Cherry → parchment etc.: input quantity in, output + loss out. */
export const processingRuns = pgTable(
  "processing_runs",
  {
    id: id(),
    orgId: orgId(),
    // Financial/ledger row: a cycle delete must not erase processing-run
    // history, so this is RESTRICT, not CASCADE.
    cropCycleId: uuid("crop_cycle_id")
      .notNull()
      .references(() => cropCycles.id, { onDelete: "no action" }),
    harvestLotId: uuid("harvest_lot_id").references(() => harvestLots.id, {
      onDelete: "set null",
    }),
    date: date("date").notNull(),
    inputQuantity: qty("input_quantity").notNull(),
    inputUnit: text("input_unit").notNull(),
    outputQuantity: qty("output_quantity").notNull(),
    outputUnit: text("output_unit").notNull(),
    // Direct processing cost (drying, milling…), in the org base currency.
    cost: money("cost").notNull().default("0"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id),
    ...timestamps,
  },
  (t) => [index("processing_runs_org_cycle_idx").on(t.orgId, t.cropCycleId)],
);

export const sales = pgTable(
  "sales",
  {
    id: id(),
    orgId: orgId(),
    cropCycleId: uuid("crop_cycle_id").references(() => cropCycles.id, {
      onDelete: "set null",
    }),
    date: date("date").notNull(),
    buyerName: text("buyer_name").notNull(),
    invoiceNumber: text("invoice_number"),
    currencyCode: text("currency_code").notNull().default("USD"),
    // Snapshot: multiply totals by this to get org base currency.
    exchangeRate: numeric("exchange_rate", { precision: 18, scale: 8 })
      .notNull()
      .default("1"),
    subtotal: money("subtotal").notNull().default("0"),
    total: money("total").notNull().default("0"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id),
    ...timestamps,
  },
  (t) => [
    index("sales_org_date_idx").on(t.orgId, t.date),
    index("sales_org_cycle_idx").on(t.orgId, t.cropCycleId),
    check("sales_currency_code_check", sql`char_length(${t.currencyCode}) = 3`),
  ],
);

export const saleLines = pgTable(
  "sale_lines",
  {
    id: id(),
    orgId: orgId(),
    saleId: uuid("sale_id")
      .notNull()
      .references(() => sales.id, { onDelete: "cascade" }),
    description: text("description").notNull(),
    quantity: qty("quantity").notNull(),
    unit: text("unit").notNull().default("kg"),
    unitPrice: money("unit_price").notNull().default("0"),
    total: money("total").notNull().default("0"),
    ...timestamps,
  },
  (t) => [index("sale_lines_sale_idx").on(t.saleId)],
);
