import { sql } from "drizzle-orm";
import { check, index, numeric, pgTable, text, unique } from "drizzle-orm/pg-core";
import { organization } from "./tenancy";
import {
  id,
  nullableOrgCatalogPolicies,
  orgId,
  orgIsolationPolicy,
  timestamps,
} from "./helpers";

/** org_id NULL = global seeded defaults visible to every org. */
export const activityTypes = pgTable(
  "activity_types",
  {
    id: id(),
    orgId: text("org_id").references(() => organization.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    category: text("category", {
      enum: ["field", "general", "machine"],
    })
      .notNull()
      .default("field"),
    unitOfMeasure: text("unit_of_measure"),
    ...timestamps,
  },
  (t) => [
    check(
      "activity_types_category_check",
      sql`${t.category} IN ('field', 'general', 'machine')`,
    ),
    ...nullableOrgCatalogPolicies("activity_types"),
  ],
).enableRLS();

export const products = pgTable(
  "products",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    category: text("category", {
      enum: ["fertilizer", "agrochemical", "seed", "tool", "fuel", "other"],
    })
      .notNull()
      .default("other"),
    unit: text("unit").notNull().default("unidad"),
    activeIngredient: text("active_ingredient"),
    minStock: numeric("min_stock", { precision: 14, scale: 4 }),
    ...timestamps,
  },
  (t) => [
    index("products_org_idx").on(t.orgId),
    // Lets children add a composite (org_id, product_id) FK so a cross-tenant
    // reference is impossible at the DB level, not just app-checked.
    unique("products_org_id_uq").on(t.orgId, t.id),
    check(
      "products_category_check",
      sql`${t.category} IN ('fertilizer', 'agrochemical', 'seed', 'tool', 'fuel', 'other')`,
    ),
    ...orgIsolationPolicy("products"),
  ],
).enableRLS();
