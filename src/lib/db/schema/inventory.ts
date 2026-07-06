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
  unique,
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
  (t) => [
    index("suppliers_org_idx").on(t.orgId),
    // Lets children add a composite (org_id, supplier_id) FK so a
    // cross-tenant reference is impossible at the DB level.
    unique("suppliers_org_id_uq").on(t.orgId, t.id),
  ],
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
    // Lets children add a composite (org_id, warehouse_id) FK so a
    // cross-tenant reference is impossible at the DB level.
    unique("warehouses_org_id_uq").on(t.orgId, t.id),
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
  (t) => [
    index("purchases_org_date_idx").on(t.orgId, t.date),
    index("purchases_supplier_idx").on(t.supplierId),
    index("purchases_warehouse_idx").on(t.warehouseId),
    check("purchases_currency_code_check", sql`char_length(${t.currencyCode}) = 3`),
    // Additional guards alongside the single-column FKs above: make
    // cross-tenant supplier/warehouse references impossible at the DB level.
    foreignKey({
      columns: [t.orgId, t.supplierId],
      foreignColumns: [suppliers.orgId, suppliers.id],
    }).onDelete("no action"),
    foreignKey({
      columns: [t.orgId, t.warehouseId],
      foreignColumns: [warehouses.orgId, warehouses.id],
    }).onDelete("no action"),
  ],
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
  (t) => [
    index("purchase_lines_purchase_idx").on(t.purchaseId),
    // Additional guard alongside the single-column productId FK above: makes
    // a cross-tenant product reference impossible at the DB level.
    foreignKey({
      columns: [t.orgId, t.productId],
      foreignColumns: [products.orgId, products.id],
    }).onDelete("no action"),
  ],
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
  (t) => [
    index("inv_transfers_org_date_idx").on(t.orgId, t.date),
    check(
      "inventory_transfers_diff_warehouse_check",
      sql`${t.fromWarehouseId} <> ${t.toWarehouseId}`,
    ),
    // Additional guards alongside the single-column FKs above: make
    // cross-tenant warehouse references impossible at the DB level.
    foreignKey({
      columns: [t.orgId, t.fromWarehouseId],
      foreignColumns: [warehouses.orgId, warehouses.id],
    }).onDelete("no action"),
    foreignKey({
      columns: [t.orgId, t.toWarehouseId],
      foreignColumns: [warehouses.orgId, warehouses.id],
    }).onDelete("no action"),
  ],
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
  (t) => [
    index("inv_transfer_lines_transfer_idx").on(t.transferId),
    // Additional guard alongside the single-column productId FK above: makes
    // a cross-tenant product reference impossible at the DB level.
    foreignKey({
      columns: [t.orgId, t.productId],
      foreignColumns: [products.orgId, products.id],
    }).onDelete("no action"),
  ],
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
    index("inv_mov_org_date_idx").on(t.orgId, t.date),
    // A source row generates at most one movement — replay-safe consumption.
    uniqueIndex("inv_mov_ref_uq")
      .on(t.refKind, t.refId)
      .where(sql`${t.refId} IS NOT NULL`),
    check(
      "inventory_movements_type_check",
      sql`${t.type} IN ('purchase', 'consumption', 'adjustment_in', 'adjustment_out', 'harvest_in', 'transfer_in', 'transfer_out')`,
    ),
    // ref_kind has no TS enum (plain text); constrained to the literal
    // values the services actually write (purchases/transfers/activities).
    // Manual adjustments leave it NULL.
    check(
      "inventory_movements_ref_kind_check",
      sql`${t.refKind} IS NULL OR ${t.refKind} IN ('purchase_line', 'transfer_line_out', 'transfer_line_in', 'activity_input')`,
    ),
    check("inventory_movements_quantity_nonzero_check", sql`${t.quantity} <> 0`),
    // Additional guards alongside the single-column FKs above: make
    // cross-tenant product/warehouse references impossible at the DB level.
    foreignKey({
      columns: [t.orgId, t.productId],
      foreignColumns: [products.orgId, products.id],
    }).onDelete("no action"),
    foreignKey({
      columns: [t.orgId, t.warehouseId],
      foreignColumns: [warehouses.orgId, warehouses.id],
    }).onDelete("no action"),
  ],
);
