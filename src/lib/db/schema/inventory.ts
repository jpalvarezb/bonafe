import { sql } from "drizzle-orm";
import {
  boolean,
  date,
  index,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { farms } from "./farms";
import { products } from "./catalog";
import { user } from "./auth";
import { id, orgId, timestamps } from "./helpers";

const money = (name: string) => numeric(name, { precision: 14, scale: 4 });
const qty = (name: string) => numeric(name, { precision: 14, scale: 4 });

export const suppliers = pgTable(
  "suppliers",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    contactName: text("contact_name"),
    phone: text("phone"),
    email: text("email"),
    taxId: text("tax_id"),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("suppliers_org_idx").on(t.orgId)],
);

/** Phase 4 ships a single default warehouse per org; transfers arrive Phase 5. */
export const warehouses = pgTable(
  "warehouses",
  {
    id: id(),
    orgId: orgId(),
    farmId: uuid("farm_id").references(() => farms.id, {
      onDelete: "set null",
    }),
    name: text("name").notNull(),
    isDefault: boolean("is_default").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("warehouses_org_idx").on(t.orgId),
    // At most one default per org — makes ensureDefaultWarehouse race-safe.
    uniqueIndex("warehouses_org_default_uq")
      .on(t.orgId)
      .where(sql`${t.isDefault}`),
  ],
);

export const purchases = pgTable(
  "purchases",
  {
    id: id(),
    orgId: orgId(),
    supplierId: uuid("supplier_id")
      .notNull()
      .references(() => suppliers.id),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    date: date("date").notNull(),
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
  (t) => [index("purchases_org_date_idx").on(t.orgId, t.date)],
);

export const purchaseLines = pgTable(
  "purchase_lines",
  {
    id: id(),
    orgId: orgId(),
    purchaseId: uuid("purchase_id")
      .notNull()
      .references(() => purchases.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    quantity: qty("quantity").notNull(),
    unitCost: money("unit_cost").notNull().default("0"),
    total: money("total").notNull().default("0"),
    ...timestamps,
  },
  (t) => [index("purchase_lines_purchase_idx").on(t.purchaseId)],
);

/** Atomic stock moves between warehouses; lines value at the source average. */
export const inventoryTransfers = pgTable(
  "inventory_transfers",
  {
    id: id(),
    orgId: orgId(),
    fromWarehouseId: uuid("from_warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    toWarehouseId: uuid("to_warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    date: date("date").notNull(),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id),
    ...timestamps,
  },
  (t) => [index("inv_transfers_org_date_idx").on(t.orgId, t.date)],
);

export const inventoryTransferLines = pgTable(
  "inventory_transfer_lines",
  {
    id: id(),
    orgId: orgId(),
    transferId: uuid("transfer_id")
      .notNull()
      .references(() => inventoryTransfers.id, { onDelete: "cascade" }),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    quantity: qty("quantity").notNull(),
    // Source-warehouse weighted average at transfer time; the inbound movement
    // enters the destination at this cost.
    unitCostSnapshot: money("unit_cost_snapshot").notNull().default("0"),
    ...timestamps,
  },
  (t) => [index("inv_transfer_lines_transfer_idx").on(t.transferId)],
);

/**
 * Signed stock ledger: quantity > 0 flows in (purchase, adjustment_in),
 * quantity < 0 flows out (consumption, adjustment_out). Stock = SUM(quantity);
 * valuation is weighted-average over inbound rows (calc/inventory.ts).
 */
export const inventoryMovements = pgTable(
  "inventory_movements",
  {
    id: id(),
    orgId: orgId(),
    warehouseId: uuid("warehouse_id")
      .notNull()
      .references(() => warehouses.id),
    productId: uuid("product_id")
      .notNull()
      .references(() => products.id),
    date: date("date").notNull(),
    type: text("type", {
      enum: [
        "purchase",
        "consumption",
        "adjustment_in",
        "adjustment_out",
        "harvest_in",
        "transfer_in",
        "transfer_out",
      ],
    }).notNull(),
    quantity: qty("quantity").notNull(),
    // Cost per unit for inbound rows; NULL on outbound (valued at running avg).
    unitCost: money("unit_cost"),
    // Source row that generated this movement (purchase_line, activity_input…).
    refKind: text("ref_kind"),
    refId: uuid("ref_id"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id),
    ...timestamps,
  },
  (t) => [
    index("inv_mov_org_wh_product_idx").on(t.orgId, t.warehouseId, t.productId),
    // A source row generates at most one movement — replay-safe consumption.
    uniqueIndex("inv_mov_ref_uq")
      .on(t.refKind, t.refId)
      .where(sql`${t.refId} IS NOT NULL`),
  ],
);
