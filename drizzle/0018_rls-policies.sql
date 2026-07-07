ALTER TABLE "activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_inputs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_labor" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "audit_log" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "import_jobs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_exchange_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "org_subscriptions" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "activity_types" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "products" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "climate_readings" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crop_cycles" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crop_stages" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crop_varieties" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "crops" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "farms" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "parcels" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "harvests" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "cost_centers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "work_orders" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "monitoring_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "attendance_records" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payroll_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "payroll_periods" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "piece_rates" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "piecework_entries" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "workers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inventory_movements" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inventory_transfer_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchase_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "purchases" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "suppliers" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "warehouses" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "machine_usage_logs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "machines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "budget_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "budgets" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "planned_activities" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "harvest_lot_items" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "harvest_lots" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "processing_runs" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sale_lines" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
ALTER TABLE "sales" ENABLE ROW LEVEL SECURITY;--> statement-breakpoint
CREATE POLICY "activities_org_isolation" ON "activities" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "activity_inputs_org_isolation" ON "activity_inputs" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "activity_labor_org_isolation" ON "activity_labor" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "audit_log_org_isolation" ON "audit_log" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "import_jobs_org_isolation" ON "import_jobs" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "org_exchange_rates_org_isolation" ON "org_exchange_rates" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "org_subscriptions_org_isolation" ON "org_subscriptions" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "activity_types_org_select" ON "activity_types" AS PERMISSIVE FOR SELECT TO "agropeq_app" USING (org_id IS NULL OR org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "activity_types_org_insert" ON "activity_types" AS PERMISSIVE FOR INSERT TO "agropeq_app" WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "activity_types_org_update" ON "activity_types" AS PERMISSIVE FOR UPDATE TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "activity_types_org_delete" ON "activity_types" AS PERMISSIVE FOR DELETE TO "agropeq_app" USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "products_org_isolation" ON "products" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "climate_readings_org_isolation" ON "climate_readings" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "crop_cycles_org_isolation" ON "crop_cycles" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "crop_stages_org_select" ON "crop_stages" AS PERMISSIVE FOR SELECT TO "agropeq_app" USING (org_id IS NULL OR org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "crop_stages_org_insert" ON "crop_stages" AS PERMISSIVE FOR INSERT TO "agropeq_app" WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "crop_stages_org_update" ON "crop_stages" AS PERMISSIVE FOR UPDATE TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "crop_stages_org_delete" ON "crop_stages" AS PERMISSIVE FOR DELETE TO "agropeq_app" USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "crop_varieties_org_select" ON "crop_varieties" AS PERMISSIVE FOR SELECT TO "agropeq_app" USING (org_id IS NULL OR org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "crop_varieties_org_insert" ON "crop_varieties" AS PERMISSIVE FOR INSERT TO "agropeq_app" WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "crop_varieties_org_update" ON "crop_varieties" AS PERMISSIVE FOR UPDATE TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "crop_varieties_org_delete" ON "crop_varieties" AS PERMISSIVE FOR DELETE TO "agropeq_app" USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "crops_org_select" ON "crops" AS PERMISSIVE FOR SELECT TO "agropeq_app" USING (org_id IS NULL OR org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "crops_org_insert" ON "crops" AS PERMISSIVE FOR INSERT TO "agropeq_app" WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "crops_org_update" ON "crops" AS PERMISSIVE FOR UPDATE TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "crops_org_delete" ON "crops" AS PERMISSIVE FOR DELETE TO "agropeq_app" USING (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "farms_org_isolation" ON "farms" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "parcels_org_isolation" ON "parcels" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "harvests_org_isolation" ON "harvests" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "cost_centers_org_isolation" ON "cost_centers" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "work_orders_org_isolation" ON "work_orders" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "monitoring_records_org_isolation" ON "monitoring_records" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "attendance_records_org_isolation" ON "attendance_records" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "payroll_entries_org_isolation" ON "payroll_entries" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "payroll_periods_org_isolation" ON "payroll_periods" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "piece_rates_org_isolation" ON "piece_rates" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "piecework_entries_org_isolation" ON "piecework_entries" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "workers_org_isolation" ON "workers" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "inventory_movements_org_isolation" ON "inventory_movements" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "inventory_transfer_lines_org_isolation" ON "inventory_transfer_lines" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "inventory_transfers_org_isolation" ON "inventory_transfers" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "purchase_lines_org_isolation" ON "purchase_lines" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "purchases_org_isolation" ON "purchases" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "suppliers_org_isolation" ON "suppliers" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "warehouses_org_isolation" ON "warehouses" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "machine_usage_logs_org_isolation" ON "machine_usage_logs" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "machines_org_isolation" ON "machines" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "budget_lines_org_isolation" ON "budget_lines" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "budgets_org_isolation" ON "budgets" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "planned_activities_org_isolation" ON "planned_activities" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "harvest_lot_items_org_isolation" ON "harvest_lot_items" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "harvest_lots_org_isolation" ON "harvest_lots" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "processing_runs_org_isolation" ON "processing_runs" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "sale_lines_org_isolation" ON "sale_lines" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));--> statement-breakpoint
CREATE POLICY "sales_org_isolation" ON "sales" AS PERMISSIVE FOR ALL TO "agropeq_app" USING (org_id = current_setting('app.org_id', true)) WITH CHECK (org_id = current_setting('app.org_id', true));