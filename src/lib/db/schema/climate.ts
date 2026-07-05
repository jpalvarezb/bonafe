import {
  date,
  index,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { farms } from "./farms";
import { id, orgId, timestamps } from "./helpers";

export const climateReadings = pgTable(
  "climate_readings",
  {
    id: id(),
    orgId: orgId(),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    // 'chirps' rows arrive via the Phase 8 ingest job; schema is ready now.
    source: text("source", { enum: ["manual", "chirps", "station"] })
      .notNull()
      .default("manual"),
    rainfallMm: numeric("rainfall_mm", { precision: 8, scale: 2 }),
    tempMinC: numeric("temp_min_c", { precision: 5, scale: 2 }),
    tempMaxC: numeric("temp_max_c", { precision: 5, scale: 2 }),
    humidityPct: numeric("humidity_pct", { precision: 5, scale: 2 }),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("climate_farm_date_source_uq").on(t.farmId, t.date, t.source),
    index("climate_org_date_idx").on(t.orgId, t.date),
  ],
);
