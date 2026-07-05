import { sql } from "drizzle-orm";
import { text, timestamp, uuid } from "drizzle-orm/pg-core";
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
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
};
