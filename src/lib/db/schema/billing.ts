import { sql } from "drizzle-orm";
import {
  check,
  date,
  index,
  jsonb,
  numeric,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
} from "drizzle-orm/pg-core";
import { organization } from "./tenancy";
import { id, orgId, timestamps } from "./helpers";

/** Plan codes are stable identifiers: semilla | cultivo | cosecha. */
export const plans = pgTable("plans", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  monthlyPriceUsd: numeric("monthly_price_usd", {
    precision: 10,
    scale: 2,
  }).notNull(),
  /** { maxUsers: number|null, maxFarms: number|null, features: string[] } */
  limits: jsonb("limits").notNull().default({}),
  ...timestamps,
});

export const orgSubscriptions = pgTable(
  "org_subscriptions",
  {
    id: id(),
    orgId: text("org_id")
      .notNull()
      .unique()
      .references(() => organization.id, { onDelete: "cascade" }),
    planId: text("plan_id")
      .notNull()
      .references(() => plans.id),
    status: text("status", {
      enum: ["trialing", "active", "past_due", "canceled"],
    })
      .notNull()
      .default("trialing"),
    periodEnd: timestamp("period_end", { withTimezone: true }),
    stripeCustomerId: text("stripe_customer_id"),
    stripeSubscriptionId: text("stripe_subscription_id"),
    // Stripe event.created of the last applied webhook — ordering guard so a
    // late-delivered older event can't clobber newer subscription state.
    lastStripeEventAt: timestamp("last_stripe_event_at", {
      withTimezone: true,
    }),
    ...timestamps,
  },
  (t) => [
    check(
      "org_subscriptions_status_check",
      sql`${t.status} IN ('trialing', 'active', 'past_due', 'canceled')`,
    ),
  ],
);

export const orgExchangeRates = pgTable(
  "org_exchange_rates",
  {
    id: id(),
    orgId: orgId(),
    currencyCode: text("currency_code").notNull(),
    /** Multiply an amount in currency_code by this to get base currency. */
    rateToBase: numeric("rate_to_base", { precision: 18, scale: 8 }).notNull(),
    validDate: date("valid_date").notNull(),
    ...timestamps,
  },
  (t) => [
    uniqueIndex("org_rates_uq").on(t.orgId, t.currencyCode, t.validDate),
    index("org_rates_lookup_idx").on(t.orgId, t.currencyCode),
    check(
      "org_exchange_rates_currency_code_check",
      sql`char_length(${t.currencyCode}) = 3`,
    ),
  ],
);

/** Processed Stripe webhook events — the unique id makes replays no-ops. */
export const stripeEvents = pgTable("stripe_events", {
  id: text("id").primaryKey(), // Stripe event id (evt_...)
  type: text("type").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true })
    .notNull()
    .defaultNow(),
});

/** Append-only trail of sensitive mutations. Never updated or deleted. */
export const auditLog = pgTable(
  "audit_log",
  {
    id: id(),
    orgId: orgId(),
    actorUserId: text("actor_user_id"),
    // Snapshot of the actor at write time — survives user deletion/rename so
    // the trail stays readable even after the `user` row is gone.
    actorName: text("actor_name"),
    actorEmail: text("actor_email"),
    /** e.g. "member.invite", "sale.delete", "payroll.close", "billing.plan_change" */
    action: text("action").notNull(),
    entity: text("entity"),
    entityId: text("entity_id"),
    /** Small, non-sensitive context (names, amounts) — never secrets. */
    meta: jsonb("meta").notNull().default({}),
    createdAt: timestamp("created_at", { withTimezone: true })
      .notNull()
      .defaultNow(),
  },
  (t) => [index("audit_log_org_created_idx").on(t.orgId, t.createdAt)],
);

export const importJobs = pgTable(
  "import_jobs",
  {
    id: id(),
    orgId: orgId(),
    type: text("type", { enum: ["products", "parcels", "activities"] }).notNull(),
    fileName: text("file_name").notNull(),
    status: text("status", { enum: ["done", "failed"] }).notNull(),
    rowsImported: numeric("rows_imported", { precision: 10, scale: 0 })
      .notNull()
      .default("0"),
    errorReport: jsonb("error_report").notNull().default([]),
    createdBy: text("created_by"),
    ...timestamps,
  },
  (t) => [index("import_jobs_org_idx").on(t.orgId)],
);
