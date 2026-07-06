import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { geoPoint } from "../geometry";
import { parcels } from "./farms";
import { cropCycles } from "./crops";
import { user } from "./auth";
import { id, orgId, timestamps } from "./helpers";

export const monitoringRecords = pgTable(
  "monitoring_records",
  {
    id: id(),
    orgId: orgId(),
    parcelId: uuid("parcel_id")
      .notNull()
      .references(() => parcels.id, { onDelete: "cascade" }),
    cropCycleId: uuid("crop_cycle_id").references(() => cropCycles.id, {
      onDelete: "set null",
    }),
    date: date("date").notNull(),
    type: text("type", { enum: ["pest", "disease", "weed"] }).notNull(),
    agentName: text("agent_name").notNull(),
    severity: integer("severity").notNull().default(1),
    incidencePct: numeric("incidence_pct", { precision: 5, scale: 2 }),
    location: geoPoint("location"),
    photos: jsonb("photos").notNull().default([]),
    notes: text("notes"),
    actionsTaken: text("actions_taken"),
    createdBy: text("created_by").references(() => user.id),
    ...timestamps,
  },
  (t) => [
    index("monitoring_org_date_idx").on(t.orgId, t.date),
    index("monitoring_org_parcel_idx").on(t.orgId, t.parcelId),
    check("monitoring_records_severity_check", sql`${t.severity} BETWEEN 1 AND 5`),
    check(
      "monitoring_records_incidence_pct_check",
      sql`${t.incidencePct} IS NULL OR (${t.incidencePct} BETWEEN 0 AND 100)`,
    ),
  ],
);
