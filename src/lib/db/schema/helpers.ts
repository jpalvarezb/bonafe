import { sql } from "drizzle-orm";
import { pgPolicy, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { organization } from "./tenancy";

/** Every tenant table carries org_id; every query must scope by it. */
export const orgId = () =>
  text("org_id")
    .notNull()
    .references(() => organization.id, { onDelete: "cascade" });

export const id = () =>
  uuid("id")
    .primaryKey()
    .default(sql`gen_random_uuid()`);

export const timestamps = {
  createdAt: timestamp("created_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};

/**
 * Row-level security policies. `to` is a plain role-name string (NOT a
 * drizzle `pgRole()`) — the agropeq_app role's lifecycle is managed by hand
 * in drizzle/0017_app-role.sql, not by drizzle-kit. Every table these are
 * attached to must also call `.enableRLS()`.
 */
const APP_ROLE = "agropeq_app";
const ORG_MATCH = sql`org_id = current_setting('app.org_id', true)`;

/**
 * For tables with a NOT NULL org_id: a single policy covering every
 * operation, scoping both which rows are visible (USING) and which rows
 * can be written (WITH CHECK) to the current request's org.
 */
export const orgIsolationPolicy = (tableName: string) => [
  pgPolicy(`${tableName}_org_isolation`, {
    as: "permissive",
    for: "all",
    to: APP_ROLE,
    using: ORG_MATCH,
    withCheck: ORG_MATCH,
  }),
];

/**
 * For nullable-org catalogs (org_id NULL = global default, seeded outside
 * the app): reads see the org's own rows plus the global ones, but the app
 * can never create, mutate, or delete a global row — only per-operation
 * policies express that asymmetry, so this is four policies, not one.
 */
export const nullableOrgCatalogPolicies = (tableName: string) => [
  pgPolicy(`${tableName}_org_select`, {
    as: "permissive",
    for: "select",
    to: APP_ROLE,
    using: sql`org_id IS NULL OR ${ORG_MATCH}`,
  }),
  pgPolicy(`${tableName}_org_insert`, {
    as: "permissive",
    for: "insert",
    to: APP_ROLE,
    withCheck: ORG_MATCH,
  }),
  pgPolicy(`${tableName}_org_update`, {
    as: "permissive",
    for: "update",
    to: APP_ROLE,
    using: ORG_MATCH,
    withCheck: ORG_MATCH,
  }),
  pgPolicy(`${tableName}_org_delete`, {
    as: "permissive",
    for: "delete",
    to: APP_ROLE,
    using: ORG_MATCH,
  }),
];
