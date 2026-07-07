import {
  boolean,
  date,
  index,
  numeric,
  pgTable,
  text,
  uuid,
} from "drizzle-orm/pg-core";
import { farms, parcels } from "./farms";
import { cropCycles } from "./crops";
import { workers } from "./labor";
import { user } from "./auth";
import { id, orgId, orgIsolationPolicy, timestamps } from "./helpers";

/** Field harvest weight capture (offline-capable). Lots/processing in Phase 6. */
export const harvests = pgTable(
  "harvests",
  {
    id: id(),
    orgId: orgId(),
    // Financial/ledger row: a farm/parcel delete must not silently erase
    // harvest history, so these are RESTRICT, not CASCADE.
    farmId: uuid("farm_id").references(() => farms.id, {
      onDelete: "no action",
    }),
    parcelId: uuid("parcel_id")
      .notNull()
      .references(() => parcels.id, { onDelete: "no action" }),
    cropCycleId: uuid("crop_cycle_id").references(() => cropCycles.id, {
      onDelete: "set null",
    }),
    workerId: uuid("worker_id").references(() => workers.id, {
      onDelete: "set null",
    }),
    date: date("date").notNull(),
    quantity: numeric("quantity", { precision: 14, scale: 4 }).notNull(),
    // Free-unit weights (kg, lb, qq, lata…); reports group by unit.
    unit: text("unit").notNull().default("kg"),
    qualityGrade: text("quality_grade"),
    notes: text("notes"),
    createdBy: text("created_by").references(() => user.id),
    createdOffline: boolean("created_offline").notNull().default(false),
    ...timestamps,
  },
  (t) => [
    index("harvests_org_date_idx").on(t.orgId, t.date),
    index("harvests_org_cycle_idx").on(t.orgId, t.cropCycleId),
    index("harvests_parcel_idx").on(t.parcelId),
    index("harvests_worker_idx").on(t.workerId),
    ...orgIsolationPolicy("harvests"),
  ],
).enableRLS();
