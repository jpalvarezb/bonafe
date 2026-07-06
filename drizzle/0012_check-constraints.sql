ALTER TABLE "activities" ADD CONSTRAINT "activities_currency_code_check" CHECK (char_length("activities"."currency_code") = 3);--> statement-breakpoint
ALTER TABLE "activity_labor" ADD CONSTRAINT "activity_labor_rate_type_check" CHECK ("activity_labor"."rate_type" IN ('daily', 'hourly', 'piecework'));--> statement-breakpoint
ALTER TABLE "activity_labor" ADD CONSTRAINT "activity_labor_hours_nonneg_check" CHECK ("activity_labor"."hours" IS NULL OR "activity_labor"."hours" >= 0);--> statement-breakpoint
ALTER TABLE "activity_labor" ADD CONSTRAINT "activity_labor_rate_nonneg_check" CHECK ("activity_labor"."rate" >= 0);--> statement-breakpoint
ALTER TABLE "activity_labor" ADD CONSTRAINT "activity_labor_amount_nonneg_check" CHECK ("activity_labor"."amount" >= 0);--> statement-breakpoint
ALTER TABLE "org_exchange_rates" ADD CONSTRAINT "org_exchange_rates_currency_code_check" CHECK (char_length("org_exchange_rates"."currency_code") = 3);--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD CONSTRAINT "org_subscriptions_status_check" CHECK ("org_subscriptions"."status" IN ('trialing', 'active', 'past_due', 'canceled'));--> statement-breakpoint
ALTER TABLE "crop_cycles" ADD CONSTRAINT "crop_cycles_status_check" CHECK ("crop_cycles"."status" IN ('planned', 'active', 'closed'));--> statement-breakpoint
ALTER TABLE "crop_cycles" ADD CONSTRAINT "crop_cycles_date_range_check" CHECK ("crop_cycles"."end_date" IS NULL OR "crop_cycles"."end_date" >= "crop_cycles"."start_date");--> statement-breakpoint
ALTER TABLE "member" ADD CONSTRAINT "member_role_check" CHECK ("member"."role" IN ('owner', 'admin', 'manager', 'field_supervisor'));--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_status_check" CHECK ("work_orders"."status" IN ('draft', 'assigned', 'in_progress', 'done', 'cancelled'));--> statement-breakpoint
ALTER TABLE "monitoring_records" ADD CONSTRAINT "monitoring_records_severity_check" CHECK ("monitoring_records"."severity" BETWEEN 1 AND 5);--> statement-breakpoint
ALTER TABLE "monitoring_records" ADD CONSTRAINT "monitoring_records_incidence_pct_check" CHECK ("monitoring_records"."incidence_pct" IS NULL OR ("monitoring_records"."incidence_pct" BETWEEN 0 AND 100));--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_status_check" CHECK ("attendance_records"."status" IN ('present', 'half_day', 'absent', 'sick', 'leave'));--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_hours_worked_nonneg_check" CHECK ("attendance_records"."hours_worked" IS NULL OR "attendance_records"."hours_worked" >= 0);--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_daily_rate_nonneg_check" CHECK ("attendance_records"."daily_rate_snapshot" >= 0);--> statement-breakpoint
ALTER TABLE "attendance_records" ADD CONSTRAINT "attendance_records_hourly_rate_nonneg_check" CHECK ("attendance_records"."hourly_rate_snapshot" >= 0);--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_status_check" CHECK ("payroll_periods"."status" IN ('open', 'closed'));--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_date_range_check" CHECK ("payroll_periods"."end_date" >= "payroll_periods"."start_date");--> statement-breakpoint
ALTER TABLE "payroll_periods" ADD CONSTRAINT "payroll_periods_currency_code_check" CHECK (char_length("payroll_periods"."currency_code") = 3);--> statement-breakpoint
ALTER TABLE "piece_rates" ADD CONSTRAINT "piece_rates_rate_nonneg_check" CHECK ("piece_rates"."rate" >= 0);--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_daily_rate_nonneg_check" CHECK ("workers"."daily_rate" >= 0);--> statement-breakpoint
ALTER TABLE "workers" ADD CONSTRAINT "workers_hourly_rate_nonneg_check" CHECK ("workers"."hourly_rate" >= 0);--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_type_check" CHECK ("inventory_movements"."type" IN ('purchase', 'consumption', 'adjustment_in', 'adjustment_out', 'harvest_in', 'transfer_in', 'transfer_out'));--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_ref_kind_check" CHECK ("inventory_movements"."ref_kind" IS NULL OR "inventory_movements"."ref_kind" IN ('purchase_line', 'transfer_line_out', 'transfer_line_in', 'activity_input'));--> statement-breakpoint
ALTER TABLE "inventory_movements" ADD CONSTRAINT "inventory_movements_quantity_nonzero_check" CHECK ("inventory_movements"."quantity" <> 0);--> statement-breakpoint
ALTER TABLE "inventory_transfers" ADD CONSTRAINT "inventory_transfers_diff_warehouse_check" CHECK ("inventory_transfers"."from_warehouse_id" <> "inventory_transfers"."to_warehouse_id");--> statement-breakpoint
ALTER TABLE "purchases" ADD CONSTRAINT "purchases_currency_code_check" CHECK (char_length("purchases"."currency_code") = 3);--> statement-breakpoint
ALTER TABLE "machine_usage_logs" ADD CONSTRAINT "machine_usage_logs_hours_used_nonneg_check" CHECK ("machine_usage_logs"."hours_used" >= 0);--> statement-breakpoint
ALTER TABLE "machine_usage_logs" ADD CONSTRAINT "machine_usage_logs_fuel_liters_nonneg_check" CHECK ("machine_usage_logs"."fuel_liters" IS NULL OR "machine_usage_logs"."fuel_liters" >= 0);--> statement-breakpoint
ALTER TABLE "machine_usage_logs" ADD CONSTRAINT "machine_usage_logs_fuel_cost_nonneg_check" CHECK ("machine_usage_logs"."fuel_cost" >= 0);--> statement-breakpoint
ALTER TABLE "machine_usage_logs" ADD CONSTRAINT "machine_usage_logs_hourly_cost_nonneg_check" CHECK ("machine_usage_logs"."hourly_cost_snapshot" >= 0);--> statement-breakpoint
ALTER TABLE "machine_usage_logs" ADD CONSTRAINT "machine_usage_logs_total_cost_nonneg_check" CHECK ("machine_usage_logs"."total_cost" >= 0);--> statement-breakpoint
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_currency_code_check" CHECK (char_length("budgets"."currency_code") = 3);--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_currency_code_check" CHECK (char_length("sales"."currency_code") = 3);