import {
  date,
  index,
  integer,
  numeric,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { organization } from "./tenancy";
import { farms, parcels } from "./farms";
import { id, timestamps } from "./helpers";

/** org_id NULL = global seeded catalog row visible to every org. */
export const crops = pgTable("crops", {
  id: id(),
  orgId: text("org_id").references(() => organization.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  scientificName: text("scientific_name"),
  defaultCycleDays: integer("default_cycle_days"),
  ...timestamps,
});

export const cropVarieties = pgTable("crop_varieties", {
  id: id(),
  cropId: uuid("crop_id")
    .notNull()
    .references(() => crops.id, { onDelete: "cascade" }),
  orgId: text("org_id").references(() => organization.id, {
    onDelete: "cascade",
  }),
  name: text("name").notNull(),
  notes: text("notes"),
  ...timestamps,
});

export const cropCycles = pgTable(
  "crop_cycles",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .references(() => organization.id, { onDelete: "cascade" }),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    parcelId: uuid("parcel_id")
      .notNull()
      .references(() => parcels.id, { onDelete: "cascade" }),
    cropId: uuid("crop_id")
      .notNull()
      .references(() => crops.id),
    varietyId: uuid("variety_id").references(() => cropVarieties.id),
    name: text("name").notNull(),
    startDate: date("start_date").notNull(),
    expectedEndDate: date("expected_end_date"),
    endDate: date("end_date"),
    status: text("status", {
      enum: ["planned", "active", "closed"],
    })
      .notNull()
      .default("active"),
    plantedAreaHa: numeric("planted_area_ha", { precision: 12, scale: 4 }),
    plantCount: integer("plant_count"),
    ...timestamps,
  },
  (t) => [
    index("crop_cycles_org_idx").on(t.orgId),
    index("crop_cycles_parcel_idx").on(t.orgId, t.parcelId),
  ],
);
