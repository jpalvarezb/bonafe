CREATE TABLE "import_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"type" text NOT NULL,
	"file_name" text NOT NULL,
	"status" text NOT NULL,
	"rows_imported" numeric(10, 0) DEFAULT '0' NOT NULL,
	"error_report" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_exchange_rates" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"currency_code" text NOT NULL,
	"rate_to_base" numeric(18, 8) NOT NULL,
	"valid_date" date NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "org_subscriptions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"plan_id" text NOT NULL,
	"status" text DEFAULT 'trialing' NOT NULL,
	"period_end" timestamp,
	"stripe_customer_id" text,
	"stripe_subscription_id" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL,
	CONSTRAINT "org_subscriptions_org_id_unique" UNIQUE("org_id")
);
--> statement-breakpoint
CREATE TABLE "plans" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"monthly_price_usd" numeric(10, 2) NOT NULL,
	"limits" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "climate_readings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"farm_id" uuid NOT NULL,
	"date" date NOT NULL,
	"source" text DEFAULT 'manual' NOT NULL,
	"rainfall_mm" numeric(8, 2),
	"temp_min_c" numeric(5, 2),
	"temp_max_c" numeric(5, 2),
	"humidity_pct" numeric(5, 2),
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "cost_centers" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"name" text NOT NULL,
	"parent_id" uuid,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "work_orders" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"code" text NOT NULL,
	"title" text NOT NULL,
	"type" text DEFAULT 'field' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"assigned_to_member_id" text,
	"scheduled_date" date,
	"parcel_id" uuid,
	"instructions" text,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "monitoring_records" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"org_id" text NOT NULL,
	"parcel_id" uuid NOT NULL,
	"crop_cycle_id" uuid,
	"date" date NOT NULL,
	"type" text NOT NULL,
	"agent_name" text NOT NULL,
	"severity" integer DEFAULT 1 NOT NULL,
	"incidence_pct" numeric(5, 2),
	"location" geometry(Point,4326),
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"notes" text,
	"actions_taken" text,
	"created_by" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "cost_center_id" uuid;--> statement-breakpoint
ALTER TABLE "activities" ADD COLUMN "exchange_rate" numeric(18, 8) DEFAULT '1' NOT NULL;--> statement-breakpoint
ALTER TABLE "import_jobs" ADD CONSTRAINT "import_jobs_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_exchange_rates" ADD CONSTRAINT "org_exchange_rates_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD CONSTRAINT "org_subscriptions_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "org_subscriptions" ADD CONSTRAINT "org_subscriptions_plan_id_plans_id_fk" FOREIGN KEY ("plan_id") REFERENCES "public"."plans"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "climate_readings" ADD CONSTRAINT "climate_readings_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "climate_readings" ADD CONSTRAINT "climate_readings_farm_id_farms_id_fk" FOREIGN KEY ("farm_id") REFERENCES "public"."farms"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "cost_centers" ADD CONSTRAINT "cost_centers_parent_id_cost_centers_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."cost_centers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_assigned_to_member_id_member_id_fk" FOREIGN KEY ("assigned_to_member_id") REFERENCES "public"."member"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "work_orders" ADD CONSTRAINT "work_orders_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_records" ADD CONSTRAINT "monitoring_records_org_id_organization_id_fk" FOREIGN KEY ("org_id") REFERENCES "public"."organization"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_records" ADD CONSTRAINT "monitoring_records_parcel_id_parcels_id_fk" FOREIGN KEY ("parcel_id") REFERENCES "public"."parcels"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_records" ADD CONSTRAINT "monitoring_records_crop_cycle_id_crop_cycles_id_fk" FOREIGN KEY ("crop_cycle_id") REFERENCES "public"."crop_cycles"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "monitoring_records" ADD CONSTRAINT "monitoring_records_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "import_jobs_org_idx" ON "import_jobs" USING btree ("org_id");--> statement-breakpoint
CREATE UNIQUE INDEX "org_rates_uq" ON "org_exchange_rates" USING btree ("org_id","currency_code","valid_date");--> statement-breakpoint
CREATE INDEX "org_rates_lookup_idx" ON "org_exchange_rates" USING btree ("org_id","currency_code");--> statement-breakpoint
CREATE UNIQUE INDEX "climate_farm_date_source_uq" ON "climate_readings" USING btree ("farm_id","date","source");--> statement-breakpoint
CREATE INDEX "climate_org_date_idx" ON "climate_readings" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX "cost_centers_org_idx" ON "cost_centers" USING btree ("org_id");--> statement-breakpoint
CREATE INDEX "work_orders_org_status_idx" ON "work_orders" USING btree ("org_id","status");--> statement-breakpoint
CREATE INDEX "work_orders_org_assignee_idx" ON "work_orders" USING btree ("org_id","assigned_to_member_id");--> statement-breakpoint
CREATE INDEX "monitoring_org_date_idx" ON "monitoring_records" USING btree ("org_id","date");--> statement-breakpoint
CREATE INDEX "monitoring_org_parcel_idx" ON "monitoring_records" USING btree ("org_id","parcel_id");--> statement-breakpoint
ALTER TABLE "activities" ADD CONSTRAINT "activities_cost_center_id_cost_centers_id_fk" FOREIGN KEY ("cost_center_id") REFERENCES "public"."cost_centers"("id") ON DELETE set null ON UPDATE no action;