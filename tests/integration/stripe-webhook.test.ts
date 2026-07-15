import { randomUUID } from "node:crypto";
import Stripe from "stripe";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { POST } from "@/app/api/webhooks/stripe/route";
import { buildPriceLookupKey } from "@/lib/plan-pricing";
import {
  cleanupOrg,
  cleanupStripeEvent,
  countStripeEventRows,
  createTestOrg,
  ensurePlansCatalog,
  getOrgSubscriptionRow,
  insertOrgSubscription,
} from "./support/fixtures";

// Signing-only Stripe instance — never makes a network call. The webhook
// route verifies signatures with its own client (src/lib/stripe.ts
// getWebhookVerifier, keyed only by STRIPE_WEBHOOK_SECRET); this one exists
// purely so the test can produce a genuinely valid `stripe-signature`
// header via the SDK's own `generateTestHeaderString` helper.
const signer = new Stripe("sk_test_signing_only_never_called");

function webhookSecret(): string {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    throw new Error(
      "STRIPE_WEBHOOK_SECRET is not set — see .env.example (webhook tests " +
        "need it to sign fixture events; the live Stripe API is never called).",
    );
  }
  return secret;
}

function buildRequest(event: Record<string, unknown>): Request {
  const payload = JSON.stringify(event);
  const signature = signer.webhooks.generateTestHeaderString({
    payload,
    secret: webhookSecret(),
  });
  return new Request("http://localhost/api/webhooks/stripe", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "stripe-signature": signature,
    },
    body: payload,
  });
}

/** Unix seconds, fixed and deterministic — the ordering guard compares
 * `event.created` values against each other, never against wall-clock. */
const T0 = Math.floor(Date.UTC(2026, 5, 1, 12, 0, 0) / 1000);
const T_OLDER = T0 - 3600;

function subscriptionUpdatedEvent(params: {
  id: string;
  created: number;
  subscriptionId: string;
  customerId: string;
  status: Stripe.Subscription.Status;
  price?: { id: string; metadata?: Record<string, string>; lookup_key?: string | null };
}) {
  return {
    id: params.id,
    object: "event",
    type: "customer.subscription.updated",
    created: params.created,
    data: {
      object: {
        id: params.subscriptionId,
        object: "subscription",
        customer: params.customerId,
        status: params.status,
        items: {
          data: [
            {
              price: params.price ?? { id: "price_unmatched", metadata: {}, lookup_key: null },
              current_period_end: params.created + 2_592_000,
            },
          ],
        },
      },
    },
  };
}

function checkoutCompletedEvent(params: {
  id: string;
  created: number;
  orgId: string;
  planId: string;
  customerId: string;
  subscriptionId: string;
}) {
  return {
    id: params.id,
    object: "event",
    type: "checkout.session.completed",
    created: params.created,
    data: {
      object: {
        id: `cs_test_${randomUUID()}`,
        object: "checkout.session",
        metadata: { orgId: params.orgId, planId: params.planId },
        customer: params.customerId,
        subscription: params.subscriptionId,
      },
    },
  };
}

/**
 * Runtime coverage of the Stripe webhook state machine
 * (src/server/services/billing.ts + src/app/api/webhooks/stripe/route.ts):
 * genuinely signed fixture events against a real DB, never the live Stripe
 * API. Goes red if the stripe_events PK claim moves outside the
 * claim-and-process transaction, the eventCreatedAt ordering guard is
 * deleted, org resolution starts trusting payload metadata instead of
 * re-verifying it, or matchPlanIdFromPriceId's local-currency paths regress.
 */
describe("POST /api/webhooks/stripe", () => {
  const eventIdsToClean: string[] = [];

  beforeAll(async () => {
    await ensurePlansCatalog();
  });

  afterEach(async () => {
    while (eventIdsToClean.length > 0) {
      const id = eventIdsToClean.pop()!;
      await cleanupStripeEvent(id);
    }
  });

  describe("idempotent replay + ordering guard", () => {
    it("the same event id delivered twice yields one transition, one stripe_events row, and duplicate:true on the second delivery", async () => {
      const org = await createTestOrg();
      const customerId = `cus_test_${randomUUID()}`;
      const subscriptionId = `sub_test_${randomUUID()}`;
      await insertOrgSubscription(org.id, {
        planId: "cosecha",
        status: "trialing",
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
      });

      const eventId = `evt_test_${randomUUID()}`;
      eventIdsToClean.push(eventId);
      const event = subscriptionUpdatedEvent({
        id: eventId,
        created: T0,
        subscriptionId,
        customerId,
        status: "active",
      });

      const first = await POST(buildRequest(event));
      expect(first.status).toBe(200);
      const firstBody = await first.json();
      expect(firstBody.duplicate).toBeUndefined();

      const afterFirst = await getOrgSubscriptionRow(org.id);
      expect(afterFirst.status).toBe("active");

      const second = await POST(buildRequest(event));
      expect(second.status).toBe(200);
      const secondBody = await second.json();
      expect(secondBody.duplicate).toBe(true);

      expect(await countStripeEventRows(eventId)).toBe(1);

      // Still exactly the one transition from the first delivery.
      const afterSecond = await getOrgSubscriptionRow(org.id);
      expect(afterSecond.status).toBe("active");
      expect(afterSecond.updatedAt.getTime()).toBe(
        afterFirst.updatedAt.getTime(),
      );

      await cleanupOrg(org.id);
    });

    it("an older event.created under a NEW event id cannot overwrite newer state", async () => {
      const org = await createTestOrg();
      const customerId = `cus_test_${randomUUID()}`;
      const subscriptionId = `sub_test_${randomUUID()}`;
      await insertOrgSubscription(org.id, {
        planId: "cosecha",
        status: "trialing",
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
      });

      const newerEventId = `evt_test_${randomUUID()}`;
      const olderEventId = `evt_test_${randomUUID()}`;
      eventIdsToClean.push(newerEventId, olderEventId);

      // Apply the NEWER state first...
      await POST(
        buildRequest(
          subscriptionUpdatedEvent({
            id: newerEventId,
            created: T0,
            subscriptionId,
            customerId,
            status: "active",
          }),
        ),
      );
      const afterNewer = await getOrgSubscriptionRow(org.id);
      expect(afterNewer.status).toBe("active");

      // ...then a DIFFERENT (never-seen) event id, but with an OLDER
      // event.created, tries to move the status backwards to past_due.
      const olderRes = await POST(
        buildRequest(
          subscriptionUpdatedEvent({
            id: olderEventId,
            created: T_OLDER,
            subscriptionId,
            customerId,
            status: "past_due",
          }),
        ),
      );
      expect(olderRes.status).toBe(200);
      const olderBody = await olderRes.json();
      // Distinct event id, so it's processed (not deduped) — but the
      // ordering guard inside applySubscriptionState makes it a no-op.
      expect(olderBody.duplicate).toBeUndefined();

      const afterOlder = await getOrgSubscriptionRow(org.id);
      expect(afterOlder.status).toBe("active"); // NOT past_due
      expect(await countStripeEventRows(olderEventId)).toBe(1);

      await cleanupOrg(org.id);
    });
  });

  it("never trusts webhook metadata.orgId: an unknown org creates nothing and is acknowledged 200", async () => {
    const fakeOrgId = randomUUID();
    const eventId = `evt_test_${randomUUID()}`;
    eventIdsToClean.push(eventId);

    const res = await POST(
      buildRequest(
        checkoutCompletedEvent({
          id: eventId,
          created: T0,
          orgId: fakeOrgId,
          planId: "semilla",
          customerId: `cus_test_${randomUUID()}`,
          subscriptionId: `sub_test_${randomUUID()}`,
        }),
      ),
    );

    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.received).toBe(true);

    const row = await getOrgSubscriptionRow(fakeOrgId);
    expect(row).toBeUndefined();
  });

  describe("local-currency price resolution (matchPlanIdFromPriceId)", () => {
    it("resolves the plan via the Price's metadata.planId", async () => {
      const org = await createTestOrg();
      const customerId = `cus_test_${randomUUID()}`;
      const subscriptionId = `sub_test_${randomUUID()}`;
      await insertOrgSubscription(org.id, {
        planId: "semilla",
        status: "active",
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
      });

      const eventId = `evt_test_${randomUUID()}`;
      eventIdsToClean.push(eventId);
      await POST(
        buildRequest(
          subscriptionUpdatedEvent({
            id: eventId,
            created: T0,
            subscriptionId,
            customerId,
            status: "active",
            price: {
              id: `price_local_${randomUUID()}`,
              metadata: { planId: "cultivo" },
              lookup_key: null,
            },
          }),
        ),
      );

      const row = await getOrgSubscriptionRow(org.id);
      expect(row.planId).toBe("cultivo");

      await cleanupOrg(org.id);
    });

    it("falls back to the deterministic lookup_key when metadata.planId is absent", async () => {
      const org = await createTestOrg();
      const customerId = `cus_test_${randomUUID()}`;
      const subscriptionId = `sub_test_${randomUUID()}`;
      await insertOrgSubscription(org.id, {
        planId: "cultivo",
        status: "active",
        stripeCustomerId: customerId,
        stripeSubscriptionId: subscriptionId,
      });

      const eventId = `evt_test_${randomUUID()}`;
      eventIdsToClean.push(eventId);
      await POST(
        buildRequest(
          subscriptionUpdatedEvent({
            id: eventId,
            created: T0,
            subscriptionId,
            customerId,
            status: "active",
            price: {
              id: `price_local_${randomUUID()}`,
              metadata: {},
              lookup_key: buildPriceLookupKey("semilla", "NIO"),
            },
          }),
        ),
      );

      const row = await getOrgSubscriptionRow(org.id);
      expect(row.planId).toBe("semilla");

      await cleanupOrg(org.id);
    });
  });
});
