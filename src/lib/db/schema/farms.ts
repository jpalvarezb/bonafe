import { sql } from "drizzle-orm";
import {
  boolean,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { geoPoint, geoPolygon } from "../geometry";
import { id, orgId, timestamps } from "./helpers";

export const farms = pgTable(
  "farms",
  {
    id: id(),
    orgId: orgId(),
    name: text("name").notNull(),
    location: geoPoint("location"),
    areaHa: numeric("area_ha", { precision: 12, scale: 4 }),
    // Soft-deactivation: farms are never hard-deleted from the app.
    active: boolean("active").notNull().default(true),
    notes: text("notes"),
    ...timestamps,
  },
  (t) => [index("farms_org_idx").on(t.orgId)],
);

export const parcels = pgTable(
  "parcels",
  {
    id: id(),
    orgId: orgId(),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    code: text("code"),
    boundary: geoPolygon("boundary"),
    areaHa: numeric("area_ha", { precision: 12, scale: 4 }),
    soilType: text("soil_type"),
    attributes: jsonb("attributes").notNull().default({}),
    // Soft-deactivation: parcels are never hard-deleted from the app.
    active: boolean("active").notNull().default(true),
    ...timestamps,
  },
  (t) => [
    index("parcels_org_farm_idx").on(t.orgId, t.farmId),
    uniqueIndex("parcels_farm_code_uq")
      .on(t.farmId, t.code)
      .where(sql`${t.code} IS NOT NULL`),
  ],
);
