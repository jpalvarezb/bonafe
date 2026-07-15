ALTER TABLE "piecework_entries" ADD COLUMN "crop_cycle_id" uuid;--> statement-breakpoint
ALTER TABLE "sales" ADD COLUMN "processing_run_id" uuid;--> statement-breakpoint
ALTER TABLE "piecework_entries" ADD CONSTRAINT "piecework_entries_crop_cycle_id_crop_cycles_id_fk" FOREIGN KEY ("crop_cycle_id") REFERENCES "public"."crop_cycles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_processing_run_id_processing_runs_id_fk" FOREIGN KEY ("processing_run_id") REFERENCES "public"."processing_runs"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "piecework_entries_org_cycle_idx" ON "piecework_entries" USING btree ("org_id","crop_cycle_id");--> statement-breakpoint
CREATE INDEX "sales_org_processing_run_idx" ON "sales" USING btree ("org_id","processing_run_id");