CREATE INDEX "activities_farm_idx" ON "activities" USING btree ("farm_id");--> statement-breakpoint
CREATE INDEX "activities_activity_type_idx" ON "activities" USING btree ("activity_type_id");--> statement-breakpoint
CREATE INDEX "activities_cost_center_idx" ON "activities" USING btree ("cost_center_id");--> statement-breakpoint
CREATE INDEX "crop_cycles_crop_idx" ON "crop_cycles" USING btree ("crop_id");--> statement-breakpoint
CREATE INDEX "crop_cycles_variety_idx" ON "crop_cycles" USING btree ("variety_id");--> statement-breakpoint
CREATE INDEX "crop_cycles_current_stage_idx" ON "crop_cycles" USING btree ("current_stage_id");--> statement-breakpoint
CREATE INDEX "crop_varieties_org_idx" ON "crop_varieties" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "crops_org_idx" ON "crops" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "parcels_farm_code_uq" ON "parcels" USING btree ("farm_id","code") WHERE "parcels"."code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "harvests_parcel_idx" ON "harvests" USING btree ("parcel_id");--> statement-breakpoint
CREATE INDEX "harvests_worker_idx" ON "harvests" USING btree ("worker_id");--> statement-breakpoint
CREATE UNIQUE INDEX "invitation_org_email_pending_uq" ON "invitation" USING btree ("organization_id","email") WHERE "invitation"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "payroll_entries_worker_idx" ON "payroll_entries" USING btree ("worker_id");--> statement-breakpoint
CREATE UNIQUE INDEX "piece_rates_org_name_uq" ON "piece_rates" USING btree ("org_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "workers_org_code_uq" ON "workers" USING btree ("org_id","code") WHERE "workers"."code" IS NOT NULL;--> statement-breakpoint
CREATE INDEX "inv_mov_org_date_idx" ON "inventory_movements" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX "purchases_supplier_idx" ON "purchases" USING btree ("supplier_id");--> statement-breakpoint
CREATE INDEX "purchases_warehouse_idx" ON "purchases" USING btree ("warehouse_id");--> statement-breakpoint
CREATE INDEX "machine_usage_logs_activity_idx" ON "machine_usage_logs" USING btree ("activity_id");--> statement-breakpoint
CREATE INDEX "machine_usage_logs_work_order_idx" ON "machine_usage_logs" USING btree ("work_order_id");--> statement-breakpoint
CREATE INDEX "machine_usage_logs_operator_worker_idx" ON "machine_usage_logs" USING btree ("operator_worker_id");--> statement-breakpoint
CREATE UNIQUE INDEX "machines_org_code_uq" ON "machines" USING btree ("org_id","code") WHERE "machines"."code" IS NOT NULL;