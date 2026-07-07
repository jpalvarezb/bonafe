-- Custom SQL migration file, put your code below! --
-- Same-crop overlap guard: EXCLUDE constraints aren't expressible in drizzle,
-- so this lives here by hand (see the comment on cropCycles in
-- src/lib/db/schema/crops.ts). Blocks two cycles of the SAME crop on the SAME
-- parcel from having overlapping date ranges; intercropping different crops
-- on one parcel with overlapping dates stays legal.
CREATE EXTENSION IF NOT EXISTS btree_gist;--> statement-breakpoint
ALTER TABLE "crop_cycles" ADD CONSTRAINT "crop_cycles_no_same_crop_overlap_excl"
  EXCLUDE USING gist (
    parcel_id WITH =,
    crop_id WITH =,
    daterange(start_date, COALESCE(end_date, 'infinity'::date), '[]') WITH &&
  );