ALTER TABLE "org_exchange_rates" ADD COLUMN "source" text;--> statement-breakpoint
ALTER TABLE "org_exchange_rates" ADD COLUMN "fetched_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "org_exchange_rates" ADD CONSTRAINT "org_exchange_rates_source_check" CHECK ("org_exchange_rates"."source" IN ('manual', 'open-er-api'));