import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  numeric,
  pgTable,
  text,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";
import { farms } from "./farms";
import { id, orgId, orgIsolationPolicy, timestamps } from "./helpers";

export const climateReadings = pgTable(
  "climate_readings",
  {
    id: id(),
    orgId: orgId(),
    farmId: uuid("farm_id")
      .notNull()
      .references(() => farms.id, { onDelete: "cascade" }),
    date: date("date").notNull(),
    // Satellite rows arrive via the Phase 8 ingest providers: 'chirps' via
    // ClimateSERV, 'open_meteo' via the Open-Meteo archive (keyless default).
    // TS-level enum on a text column — widening needs no migration.
    source: text("source", {
      enum: ["manual", "chirps", "open_meteo", "station"],
    })
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
    check(
      "climate_readings_source_check",
      sql`${t.source} IN ('manual', 'chirps', 'open_meteo', 'station')`,
    ),
    ...orgIsolationPolicy("climate_readings"),
  ],
).enableRLS();
