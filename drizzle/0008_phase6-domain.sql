CREATE TABLE "crop_stages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text,
	"crop_id" uuid NOT NULL,
	"name" text NOT NULL,
	"order_index" integer DEFAULT 0 NOT NULL,
	"typical_duration_days" integer,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "piece_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"unit" text DEFAULT 'unidad' NOT NULL,
	"rate" numeric(14, 4) DEFAULT '0' NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "piecework_entries" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"worker_id" uuid NOT NULL,
	"piece_rate_id" uuid NOT NULL,
	"date" date NOT NULL,
	"quantity" numeric(14, 4) NOT NULL,
	"rate_snapshot" numeric(14, 4) DEFAULT '0' NOT NULL,
	"amount" numeric(14, 4) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "harvest_lot_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"lot_id" uuid NOT NULL,
	"harvest_id" uuid NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "harvest_lots" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"crop_cycle_id" uuid NOT NULL,
	"name" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "processing_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"crop_cycle_id" uuid NOT NULL,
	"harvest_lot_id" uuid,
	"date" date NOT NULL,
	"input_quantity" numeric(14, 4) NOT NULL,
	"input_unit" text NOT NULL,
	"output_quantity" numeric(14, 4) NOT NULL,
	"output_unit" text NOT NULL,
	"cost" numeric(14, 4) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sale_lines" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"sale_id" uuid NOT NULL,
	"description" text NOT NULL,
	"quantity" numeric(14, 4) NOT NULL,
	"unit" text DEFAULT 'kg' NOT NULL,
	"unit_price" numeric(14, 4) DEFAULT '0' NOT NULL,
	"total" numeric(14, 4) DEFAULT '0' NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sales" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"crop_cycle_id" uuid,
	"date" date NOT NULL,
	"buyer_name" text NOT NULL,
	"invoice_number" text,
	"currency_code" text DEFAULT 'USD' NOT NULL,
	"exchange_rate" numeric(18, 8) DEFAULT '1' NOT NULL,
	"subtotal" numeric(14, 4) DEFAULT '0' NOT NULL,
	"total" numeric(14, 4) DEFAULT '0' NOT NULL,
	"notes" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "crop_cycles" ADD COLUMN "current_stage_id" uuid;--> statement-breakpoint
ALTER TABLE "crop_stages" ADD CONSTRAINT "crop_stages_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "crop_stages" ADD CONSTRAINT "crop_stages_crop_id_crops_id_fk" FOREIGN KEY ("crop_id") REFERENCES "public"."crops"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piece_rates" ADD CONSTRAINT "piece_rates_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piecework_entries" ADD CONSTRAINT "piecework_entries_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piecework_entries" ADD CONSTRAINT "piecework_entries_worker_id_workers_id_fk" FOREIGN KEY ("worker_id") REFERENCES "public"."workers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piecework_entries" ADD CONSTRAINT "piecework_entries_piece_rate_id_piece_rates_id_fk" FOREIGN KEY ("piece_rate_id") REFERENCES "public"."piece_rates"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "piecework_entries" ADD CONSTRAINT "piecework_entries_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest_lot_items" ADD CONSTRAINT "harvest_lot_items_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest_lot_items" ADD CONSTRAINT "harvest_lot_items_lot_id_harvest_lots_id_fk" FOREIGN KEY ("lot_id") REFERENCES "public"."harvest_lots"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest_lot_items" ADD CONSTRAINT "harvest_lot_items_harvest_id_harvests_id_fk" FOREIGN KEY ("harvest_id") REFERENCES "public"."harvests"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest_lots" ADD CONSTRAINT "harvest_lots_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest_lots" ADD CONSTRAINT "harvest_lots_crop_cycle_id_crop_cycles_id_fk" FOREIGN KEY ("crop_cycle_id") REFERENCES "public"."crop_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "harvest_lots" ADD CONSTRAINT "harvest_lots_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_runs" ADD CONSTRAINT "processing_runs_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_runs" ADD CONSTRAINT "processing_runs_crop_cycle_id_crop_cycles_id_fk" FOREIGN KEY ("crop_cycle_id") REFERENCES "public"."crop_cycles"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_runs" ADD CONSTRAINT "processing_runs_harvest_lot_id_harvest_lots_id_fk" FOREIGN KEY ("harvest_lot_id") REFERENCES "public"."harvest_lots"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "processing_runs" ADD CONSTRAINT "processing_runs_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sale_lines" ADD CONSTRAINT "sale_lines_sale_id_sales_id_fk" FOREIGN KEY ("sale_id") REFERENCES "public"."sales"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_crop_cycle_id_crop_cycles_id_fk" FOREIGN KEY ("crop_cycle_id") REFERENCES "public"."crop_cycles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "sales" ADD CONSTRAINT "sales_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "crop_stages_crop_idx" ON "crop_stages" USING btree ("crop_id");--> statement-breakpoint
CREATE INDEX "piece_rates_org_idx" ON "piece_rates" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "piecework_org_worker_date_idx" ON "piecework_entries" USING btree ("org_id","worker_id","date");--> statement-breakpoint
CREATE INDEX "piecework_org_date_idx" ON "piecework_entries" USING btree ("org_id","date");--> statement-breakpoint
CREATE UNIQUE INDEX "harvest_lot_items_harvest_uq" ON "harvest_lot_items" USING btree ("harvest_id");--> statement-breakpoint
CREATE INDEX "harvest_lot_items_lot_idx" ON "harvest_lot_items" USING btree ("lot_id");--> statement-breakpoint
CREATE INDEX "harvest_lots_org_idx" ON "harvest_lots" USING btree ("org_id","crop_cycle_id");--> statement-breakpoint
CREATE INDEX "processing_runs_org_cycle_idx" ON "processing_runs" USING btree ("org_id","crop_cycle_id");--> statement-breakpoint
CREATE INDEX "sale_lines_sale_idx" ON "sale_lines" USING btree ("sale_id");--> statement-breakpoint
CREATE INDEX "sales_org_date_idx" ON "sales" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX "sales_org_cycle_idx" ON "sales" USING btree ("org_id","crop_cycle_id");--> statement-breakpoint
ALTER TABLE "crop_cycles" ADD CONSTRAINT "crop_cycles_current_stage_id_crop_stages_id_fk" FOREIGN KEY ("current_stage_id") REFERENCES "public"."crop_stages"("id") ON DELETE set null ON UPDATE no action;