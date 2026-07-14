import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import type Stripe from "stripe";
// dbSystem (owner connection, bypasses RLS): this whole handler is
// server-to-server (Stripe -> us), unauthenticated by session, with the org
// resolved from Stripe identifiers rather than an OrgContext — there is no
// app.org_id to scope a request-bound `db` transaction by.
import { dbSystem } from "@/lib/db";
import {
  auditLog,
  organization,
  orgSubscriptions,
  stripeEvents,
} from "@/lib/db/schema";
import type { SubscriptionStatus } from "@/lib/tenancy";
import { PLAN_DEFINITIONS } from "@/lib/plan-limits";
import {
  type BillablePlanId,
  getPlanPriceId,
  getWebhookVerifier,
  isBillablePlanId,
  PLAN_PRICE_ENV,
} from "@/lib/stripe";
import {
  applySubscriptionState,
  type DbExecutor,
  type SubscriptionStateResult,
} from "@/server/services/billing";

/**
 * Unauthenticated by design — this endpoint's ONLY trust anchor is the
 * Stripe signature verified below. It must never trust ids embedded in the
 * event payload (customer id, subscription id, or metadata.orgId) without
 * first resolving them against our own DB rows.
 */
export async function POST(request: Request) {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json(
      { error: "stripe webhook not configured" },
      { status: 503 },
    );
  }

  // Raw body MUST be read before any JSON parsing — Stripe signs the exact
  // bytes on the wire, and re-serializing a parsed object would not match.
  const rawBody = await request.text();
  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "missing signature" }, { status: 400 });
  }

  const stripe = getWebhookVerifier();
  let event: Stripe.Event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, signature, secret);
  } catch {
    return NextResponse.json({ error: "invalid signature" }, { status: 400 });
  }

  // Claim-and-process in ONE transaction. The dedupe insert claims the event
  // id atomically (PK + onConflictDoNothing); a concurrent duplicate delivery
  // blocks on that uncommitted insert and then sees either the conflict
  // (we committed → it's a true replay) or a free id (we rolled back → it
  // reprocesses). A processing failure rolls the claim back with the state
  // change, so Stripe's retry of the same event id is never mistaken for a
  // replay and never silently dropped — no manual delete-on-error needed.
  let outcome: { duplicate: boolean; audit: SubscriptionStateResult | null };
  try {
    outcome = await dbSystem.transaction(async (tx) => {
      const [inserted] = await tx
        .insert(stripeEvents)
        .values({ id: event.id, type: event.type })
        .onConflictDoNothing()
        .returning();
      if (!inserted) return { duplicate: true, audit: null };

      const audit = await processEvent(tx, event);
      return { duplicate: false, audit };
    });
  } catch (error) {
    console.error("stripe webhook processing failed", {
      eventId: event.id,
      type: event.type,
      error,
    });
    return NextResponse.json({ error: "processing failed" }, { status: 500 });
  }

  if (outcome.duplicate) {
    return NextResponse.json({ received: true, duplicate: true });
  }

  // Audit is best-effort and written AFTER the commit: a failed audit insert
  // must never roll back a subscription state change (and a raised error
  // inside the tx would poison it in Postgres even if caught).
  if (outcome.audit) await writeAudit(outcome.audit);

  return NextResponse.json({ received: true });
}

async function processEvent(
  tx: DbExecutor,
  event: Stripe.Event,
): Promise<SubscriptionStateResult | null> {
  const eventCreatedAt = new Date(event.created * 1000);
  switch (event.type) {
    case "checkout.session.completed":
      return handleCheckoutCompleted(
        tx,
        event.data.object as Stripe.Checkout.Session,
        eventCreatedAt,
      );
    case "customer.subscription.updated":
      return handleSubscriptionChange(
        tx,
        event.data.object as Stripe.Subscription,
        false,
        eventCreatedAt,
      );
    case "customer.subscription.deleted":
      return handleSubscriptionChange(
        tx,
        event.data.object as Stripe.Subscription,
        true,
        eventCreatedAt,
      );
    default:
      // Unhandled event types are still acknowledged (200) so Stripe
      // doesn't retry them; the dedupe row above already records them.
      return null;
  }
}

async function handleCheckoutCompleted(
  tx: DbExecutor,
  session: Stripe.Checkout.Session,
  eventCreatedAt: Date,
): Promise<SubscriptionStateResult | null> {
  const orgId = session.metadata?.orgId;
  const planId = session.metadata?.planId;
  if (!orgId || !planId) return null; // malformed/unrelated session — ignore
  if (!isBillablePlanId(planId)) return null;
  if (!PLAN_DEFINITIONS.some((def) => def.id === planId)) return null;

  // Never trust metadata.orgId alone — confirm the org actually exists.
  const [org] = await tx
    .select({ id: organization.id })
    .from(organization)
    .where(eq(organization.id, orgId))
    .limit(1);
  if (!org) return null;

  const customerId =
    typeof session.customer === "string"
      ? session.customer
      : (session.customer?.id ?? null);
  const subscriptionId =
    typeof session.subscription === "string"
      ? session.subscription
      : (session.subscription?.id ?? null);

  return applySubscriptionState(tx, {
    orgId: org.id,
    planId,
    status: "active",
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscriptionId,
    eventCreatedAt,
  });
}

async function handleSubscriptionChange(
  tx: DbExecutor,
  subscription: Stripe.Subscription,
  isDeletedEvent: boolean,
  eventCreatedAt: Date,
): Promise<SubscriptionStateResult | null> {
  const customerId =
    typeof subscription.customer === "string"
      ? subscription.customer
      : subscription.customer.id;

  // Resolve OUR org by subscription id first, falling back to customer id.
  // Metadata is never the trust anchor here — only rows we already wrote.
  const orgId = await resolveOrgIdForSubscription(
    tx,
    subscription.id,
    customerId,
  );
  if (!orgId) return null; // unknown to us — ignore (200)

  const status = mapStripeStatus(subscription.status, isDeletedEvent);
  if (!status) return null; // status we don't map (incomplete/paused) — ignore

  const item = subscription.items.data[0];
  const matchedPlanId = matchPlanIdFromPriceId(item?.price);
  const periodEnd =
    item?.current_period_end != null
      ? new Date(item.current_period_end * 1000)
      : null;

  return applySubscriptionState(tx, {
    orgId,
    status,
    planId: matchedPlanId,
    stripeCustomerId: customerId,
    stripeSubscriptionId: subscription.id,
    periodEnd,
    eventCreatedAt,
  });
}

async function resolveOrgIdForSubscription(
  tx: DbExecutor,
  stripeSubscriptionId: string,
  stripeCustomerId: string,
): Promise<string | null> {
  const [bySubscription] = await tx
    .select({ orgId: orgSubscriptions.orgId })
    .from(orgSubscriptions)
    .where(eq(orgSubscriptions.stripeSubscriptionId, stripeSubscriptionId))
    .limit(1);
  if (bySubscription) return bySubscription.orgId;

  const [byCustomer] = await tx
    .select({ orgId: orgSubscriptions.orgId })
    .from(orgSubscriptions)
    .where(eq(orgSubscriptions.stripeCustomerId, stripeCustomerId))
    .limit(1);
  return byCustomer?.orgId ?? null;
}

function mapStripeStatus(
  stripeStatus: Stripe.Subscription.Status,
  isDeletedEvent: boolean,
): SubscriptionStatus | null {
  if (isDeletedEvent) return "canceled";
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
    case "unpaid":
      return "past_due";
    case "canceled":
    case "incomplete_expired":
      return "canceled";
    default:
      // "incomplete" / "paused" have no defined mapping in our 4-state
      // model — ignore rather than guess at a status change.
      return null;
  }
}

/**
 * Resolves a plan id from a Stripe subscription item's Price object.
 * Three ways to match, in order:
 *   1. Exact match against a STRIPE_PRICE_* env id — the static USD price
 *      configured for each plan.
 *   2. metadata.planId — set by getOrCreateLocalPrice (src/server/services/
 *      stripe-prices.ts) on every dynamically created local-currency Price.
 *      This is our own metadata on a Price object we created, not
 *      caller-supplied event payload data, so it's trusted here (unlike
 *      session.metadata.orgId elsewhere in this file, which is re-verified
 *      against our DB before use).
 *   3. lookup_key — same deterministic format (buildPriceLookupKey:
 *      "agropeq_<planId>_<currency>_monthly"), a fallback in case metadata
 *      is ever stripped from the event payload.
 * Returns undefined (graceful fallback: keep the org's existing plan) when
 * none match — e.g. an unrelated metered add-on price.
 */
function matchPlanIdFromPriceId(
  price: Stripe.Price | undefined,
): string | undefined {
  if (!price) return undefined;

  const byEnv = (Object.keys(PLAN_PRICE_ENV) as BillablePlanId[]).find(
    (planId) => getPlanPriceId(planId) === price.id,
  );
  if (byEnv) return byEnv;

  const metaPlanId = price.metadata?.planId;
  if (metaPlanId && isBillablePlanId(metaPlanId)) return metaPlanId;

  const lookupKeyMatch = /^agropeq_([a-z0-9]+)_[a-z]{3}_monthly$/.exec(
    price.lookup_key ?? "",
  );
  const lookupKeyPlanId = lookupKeyMatch?.[1];
  if (lookupKeyPlanId && isBillablePlanId(lookupKeyPlanId)) {
    return lookupKeyPlanId;
  }

  return undefined;
}

async function writeAudit(result: SubscriptionStateResult): Promise<void> {
  if (!result.applied) return; // stale event skipped — nothing changed
  const noStatusChange = result.fromStatus === result.toStatus;
  const noPlanChange = result.fromPlanId === result.planId;
  if (noStatusChange && noPlanChange) return; // no-op renewal ping — skip noise

  try {
    await dbSystem.insert(auditLog).values({
      orgId: result.orgId,
      actorUserId: null,
      // No human actor on a webhook-driven write; a stable constant marks
      // the row as system-originated (mirrors the `audit()` user snapshot).
      actorName: "stripe-webhook",
      actorEmail: null,
      action: "billing.subscription_updated",
      entity: "org_subscription",
      entityId: result.orgId,
      meta: {
        from: result.fromStatus,
        to: result.toStatus,
        planId: result.planId,
      },
    });
  } catch (error) {
    console.warn(
      "audit log write failed",
      "billing.subscription_updated",
      error,
    );
  }
}
