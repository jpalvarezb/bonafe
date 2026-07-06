import { eq } from "drizzle-orm";
import { db } from "@/lib/db";
import { orgSubscriptions } from "@/lib/db/schema";
import type { OrgContext, SubscriptionStatus } from "@/lib/tenancy";
import { newId } from "@/lib/ids";
import { getStripeClient } from "@/lib/stripe";

/**
 * Returns the org's Stripe customer id, creating both the Stripe Customer
 * and (if missing) the org's `org_subscriptions` row on first use.
 *
 * - If a subscription row already has a stripeCustomerId, it's reused as-is.
 * - If a row exists without one (e.g. seeded/demo org), only the customer
 *   id is set — plan/status are left untouched.
 * - If no row exists yet, one is created with the same defaults
 *   `getOrgPlan` assumes for a missing row (cosecha / trialing) so the
 *   org's effective plan doesn't change just because it now has a Stripe
 *   customer attached.
 *
 * Not fully race-proof: two concurrent first-checkouts for the same org
 * could each create a Stripe customer before either write lands, leaving
 * one orphaned on Stripe. Acceptable here — this action is gated to a
 * single owner/admin clicking a button, not a high-concurrency path.
 */
export async function ensureStripeCustomer(ctx: OrgContext): Promise<string> {
  const [existing] = await db
    .select({ stripeCustomerId: orgSubscriptions.stripeCustomerId })
    .from(orgSubscriptions)
    .where(eq(orgSubscriptions.orgId, ctx.org.id))
    .limit(1);

  if (existing?.stripeCustomerId) return existing.stripeCustomerId;

  const stripe = getStripeClient();
  const customer = await stripe.customers.create({
    email: ctx.user.email,
    metadata: { orgId: ctx.org.id },
  });

  if (existing) {
    await db
      .update(orgSubscriptions)
      .set({ stripeCustomerId: customer.id })
      .where(eq(orgSubscriptions.orgId, ctx.org.id));
  } else {
    await db.insert(orgSubscriptions).values({
      id: newId(),
      orgId: ctx.org.id,
      planId: "cosecha",
      status: "trialing",
      stripeCustomerId: customer.id,
    });
  }

  return customer.id;
}

export type SubscriptionStateInput = {
  orgId: string;
  status: SubscriptionStatus;
  /**
   * Omit to leave the org's current plan untouched — used by
   * customer.subscription.updated events whose price doesn't match one of
   * our configured price envs (e.g. an unrelated metered add-on).
   */
  planId?: string;
  stripeCustomerId?: string | null;
  stripeSubscriptionId?: string | null;
  periodEnd?: Date | null;
  /** Stripe event.created — the ordering guard against stale deliveries. */
  eventCreatedAt: Date;
};

export type SubscriptionStateResult = {
  orgId: string;
  /** false when the event was older than the last applied one (skipped). */
  applied: boolean;
  fromStatus: SubscriptionStatus;
  toStatus: SubscriptionStatus;
  fromPlanId: string | null;
  planId: string;
};

/** db-or-transaction executor, so the webhook can run this inside its tx. */
type DbTx = Parameters<Parameters<(typeof db)["transaction"]>[0]>[0];
export type DbExecutor = typeof db | DbTx;

/**
 * Upserts `org_subscriptions` for a webhook-driven state change and reports
 * the before/after status so the caller can write an audit row. Shared by
 * checkout.session.completed and customer.subscription.updated/deleted.
 *
 * Ordering guard: Stripe does not guarantee in-order delivery, so a stale
 * retry of an older event must not clobber newer state — the row remembers
 * the last applied event.created and strictly-older events are skipped.
 * The locked read serializes concurrent webhook deliveries for one org.
 */
export async function applySubscriptionState(
  executor: DbExecutor,
  input: SubscriptionStateInput,
): Promise<SubscriptionStateResult> {
  const [existing] = await executor
    .select({
      planId: orgSubscriptions.planId,
      status: orgSubscriptions.status,
      lastStripeEventAt: orgSubscriptions.lastStripeEventAt,
    })
    .from(orgSubscriptions)
    .where(eq(orgSubscriptions.orgId, input.orgId))
    .limit(1)
    .for("update");

  const planId = input.planId ?? existing?.planId ?? "cosecha";
  const fromStatus: SubscriptionStatus = existing?.status ?? "trialing";

  if (
    existing?.lastStripeEventAt &&
    input.eventCreatedAt < existing.lastStripeEventAt
  ) {
    return {
      orgId: input.orgId,
      applied: false,
      fromStatus,
      toStatus: fromStatus,
      fromPlanId: existing.planId,
      planId: existing.planId,
    };
  }

  await executor
    .insert(orgSubscriptions)
    .values({
      id: newId(),
      orgId: input.orgId,
      planId,
      status: input.status,
      stripeCustomerId: input.stripeCustomerId ?? null,
      stripeSubscriptionId: input.stripeSubscriptionId ?? null,
      periodEnd: input.periodEnd ?? null,
      lastStripeEventAt: input.eventCreatedAt,
    })
    .onConflictDoUpdate({
      target: orgSubscriptions.orgId,
      set: {
        planId,
        status: input.status,
        lastStripeEventAt: input.eventCreatedAt,
        ...(input.stripeCustomerId !== undefined
          ? { stripeCustomerId: input.stripeCustomerId }
          : {}),
        ...(input.stripeSubscriptionId !== undefined
          ? { stripeSubscriptionId: input.stripeSubscriptionId }
          : {}),
        ...(input.periodEnd !== undefined
          ? { periodEnd: input.periodEnd }
          : {}),
      },
    });

  return {
    orgId: input.orgId,
    applied: true,
    fromStatus,
    toStatus: input.status,
    fromPlanId: existing?.planId ?? null,
    planId,
  };
}
