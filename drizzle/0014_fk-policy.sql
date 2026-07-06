ALTER TABLE "activities" DROP CONSTRAINT "activities_farm_id_farms_id_fk";
--> statement-breakpoint
ALTER TABLE "activities" DROP CONSTRAINT "activities_parcel_id_parcels_id_fk";
--> statement-breakpoint
ALTER TABLE "harvests" DROP CONSTRAINT "harvests_farm_id_farms_id_fk";
--> statement-breakpoint
ALTER TABLE "harvests" DROP CONSTRAINT "harvests_parcel_id_parcels_id_fk";
--> statement-breakpoint
ALTER TABLE "attendance_records" DROP CONSTRAINT "attendance_records_worker_id_workers_id_fk";
--> statement-breakpoint
ALTER TABLE "payroll_entries" DROP CONSTRAINT "payroll_entries_worker_id_workers_id_fk";
--> statement-breakpoint
ALTER TABLE "piecework_entries" DROP CONSTRAINT "piecework_entries_worker_id_workers_id_fk";
--> statement-breakpoint
ALTER TABLE "machine_usage_logs" DROP CONSTRAINT "machine_usage_logs_machine_id_machines_id_fk";
--> statement-breakpoint
ALTER TABLE "harvest_lots" DROP CONSTRAINT "harvest_lots_crop_cycle_id_crop_cycles_id_fk";
--> statement-breakpoint
ALTER TABLE "processing_runs" DROP CONSTRAINT "processing_runs_crop_cycle_id_crop_cycles_id_fk";
--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "actor_name" text;--> statement-breakpoint
ALTER TABLE "audit_log" ADD COLUMN "actor_email" text;--> statement-breakpoint
-- Hand-added backfill: snapshot the actor's current name/email onto existing
-- rows so historical audit entries stay attributable even after this write
-- path starts populating them going forward.
UPDATE audit_log SET actor_name = u.name, actor_email = u.email FROM "user" u WHERE audit_log.actor_user_id = u.id AND audit_log.actor_name IS NULL;--> statement-breakpoint
ALTER TABLE "farms" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "parcels" ADD COLUMN "active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
-- Hand-moved ahead of the composite FKs below: a referenced unique
-- constraint must exist before any FK naming it can be added.
ALTER TABLE "products" ADD CONSTRAINT "products_org_id_uq" UNIQUE("org_id","id");--> statement-breakpoint
ALTER TABLE "piece_rates" ADD CONSTRAINT "piece_rates_org_id_uq" UNIQUE("org_id","id");--> statement-breakpoint
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_org_id_uq" UNIQUE("org_id","id");--> statement-breakpoint
ALTER TABLE "warehouses" ADD CONSTRAINT "warehouses_org_id_uq" UNIQUE("org_id","id");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "activity_inputs" ADD CONSTRAINT "activity_inputs_org_id_product_id_products_org_id_id_fk" FOREIGN KEY ("org_id","product_id") REFERENCES "public"."products"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Hand-added pre-FK fix-up: null out any dangling reference before the FK
-- below is added, since better-auth wrote this column with no constraint.
UPDATE "session" SET active_organization_id = NULL WHERE active_organization_id IS NOT NULL AND active_organization_id NOT IN (SELECT id FROM organization);--> statement-breakpoint
ALTER TABLE "session" ADD CONSTRAINT "session_active_organization_id_organization_id_fk" FOREIGN KEY ("active_organization_id") REFERENCES "public"."organization"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvests" ADD CONSTRAINT "harvests_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "payroll_entries" ADD CONSTRAINT "payroll_entries_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piecework_entries" ADD CONSTRAINT "piecework_entries_org_id_piece_rate_id_piece_rates_org_id_id_fk" FOREIGN KEY ("org_id","piece_rate_id") REFERENCES "public"."piece_rates"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piecework_entries" ADD CONSTRAINT "piecework_entries_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_org_id_product_id_products_org_id_id_fk" FOREIGN KEY ("org_id","product_id") REFERENCES "public"."products"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_org_id_warehouse_id_warehouses_org_id_id_fk" FOREIGN KEY ("org_id","warehouse_id") REFERENCES "public"."warehouses"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfer_lines" ADD CONSTRAINT "inventory_transfer_lines_org_id_product_id_products_org_id_id_fk" FOREIGN KEY ("org_id","product_id") REFERENCES "public"."products"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_org_id_from_warehouse_id_warehouses_org_id_id_fk" FOREIGN KEY ("org_id","from_warehouse_id") REFERENCES "public"."warehouses"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_org_id_to_warehouse_id_warehouses_org_id_id_fk" FOREIGN KEY ("org_id","to_warehouse_id") REFERENCES "public"."warehouses"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_lines" ADD CONSTRAINT "purchase_lines_org_id_product_id_products_org_id_id_fk" FOREIGN KEY ("org_id","product_id") REFERENCES "public"."products"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_org_id_supplier_id_suppliers_org_id_id_fk" FOREIGN KEY ("org_id","supplier_id") REFERENCES "public"."suppliers"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_org_id_warehouse_id_warehouses_org_id_id_fk" FOREIGN KEY ("org_id","warehouse_id") REFERENCES "public"."warehouses"("org_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
-- Hand-added pre-FK fix-up: null out any dangling reference before the FK
-- below is added, since this column had no DB constraint until now.
UPDATE "machine_usage_logs" SET work_order_id = NULL WHERE work_order_id IS NOT NULL AND work_order_id NOT IN (SELECT id FROM work_orders);--> statement-breakpoint
ALTER TABLE "machine_usage_logs" ADD CONSTRAINT "machine_usage_logs_work_order_id_work_orders_id_fk" FOREIGN KEY ("work_order_id") REFERENCES "public"."work_orders"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "machine_usage_logs" ADD CONSTRAINT "machine_usage_logs_machine_id_machines_id_fk" FOREIGN KEY ("machine_id") REFERENCES "public"."machines"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest_lots" ADD CONSTRAINT "harvest_lots_crop_cycle_id_crop_cycles_id_fk" FOREIGN KEY ("crop_cycle_id") REFERENCES "public"."crop_cycles"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_runs" ADD CONSTRAINT "processing_runs_crop_cycle_id_crop_cycles_id_fk" FOREIGN KEY ("crop_cycle_id") REFERENCES "public"."crop_cycles"("id") ON DELETE no action ON UPDATE no action;