ALTER TABLE "import_jobs" ALTER COLUMN "rows_imported" SET DATA TYPE integer;--> statement-breakpoint
ALTER TABLE "payroll_entries" ADD COLUMN "created_by" text;--> statement-breakpoint
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "farms_location_gist_idx" ON "farms" USING gist ("location");--> statement-breakpoint
CREATE INDEX "parcels_boundary_gist_idx" ON "parcels" USING gist ("boundary");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_status_check" CHECK ("activities"."status" IN ('done', 'in_progress'));--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_type_check" CHECK ("import_jobs"."type" IN ('products', 'parcels', 'activities'));--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_status_check" CHECK ("import_jobs"."status" IN ('done', 'failed'));--> statement-breakpoint
ALTER TABLE "activity_types" ADD CONSTRAINT "activity_types_category_check" CHECK ("activity_types"."category" IN ('field', 'general', 'machine'));--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_category_check" CHECK ("products"."category" IN ('fertilizer', 'agrochemical', 'seed', 'tool', 'fuel', 'other'));--> statement-breakpoint
ALTER TABLE "climate_readings" ADD CONSTRAINT "climate_readings_source_check" CHECK ("climate_readings"."source" IN ('manual', 'chirps', 'open_meteo', 'station'));--> statement-breakpoint
ALTER TABLE "organization" ADD CONSTRAINT "organization_base_currency_code_check" CHECK (char_length("organization"."base_currency_code") = 3);--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_type_check" CHECK ("work_orders"."type" IN ('field', 'machine'));--> statement-breakpoint
ALTER TABLE "monitoring_records" ADD CONSTRAINT "monitoring_records_type_check" CHECK ("monitoring_records"."type" IN ('pest', 'disease', 'weed'));--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_type_check" CHECK ("workers"."type" IN ('fixed', 'temporary'));--> statement-breakpoint
ALTER TABLE "budget_lines" ADD CONSTRAINT "budget_lines_category_check" CHECK ("budget_lines"."category" IN ('labor', 'input', 'machine', 'other'));--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_status_check" CHECK ("budgets"."status" IN ('draft', 'active'));--> statement-breakpoint
ALTER TABLE "planned_activities" ADD CONSTRAINT "planned_activities_status_check" CHECK ("planned_activities"."status" IN ('planned', 'converted', 'cancelled'));--> statement-breakpoint
ALTER TABLE "harvest_lots" ADD CONSTRAINT "harvest_lots_status_check" CHECK ("harvest_lots"."status" IN ('open', 'closed'));--> statement-breakpoint
-- Hand-added: audit_log is append-only. Drizzle has no trigger builder, so
-- this function + trigger is maintained here by hand, not generated from the
-- schema file (audit_log's TS definition is unaffected — nothing to drift).
CREATE OR REPLACE FUNCTION audit_log_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_log is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;--> statement-breakpoint
CREATE TRIGGER audit_log_no_update_delete
  BEFORE UPDATE OR DELETE ON "audit_log"
  FOR EACH ROW EXECUTE FUNCTION audit_log_append_only();