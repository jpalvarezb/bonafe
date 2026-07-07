"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { withOrgRls } from "@/lib/db/rls";
import { orgSubscriptions } from "@/lib/db/schema";
import { requireOrgContext } from "@/lib/tenancy";
import { assertCan } from "@/lib/authz";
import { audit } from "@/lib/audit";
import {
  getPlanPriceId,
  getStripeClient,
  isBillablePlanId,
  isStripeConfigured,
} from "@/lib/stripe";
import { ensureStripeCustomer } from "@/server/services/billing";

const scope = z.object({
  locale: z.string(),
  orgSlug: z.string(),
  planId: z.string(),
});

/**
 * No error.tsx/toast plumbing exists in this codebase yet for surfacing
 * action failures to the user, so these throw Errors whose message is a
 * stable, translation-key-shaped string (`billing.errors.*`, mirrored in
 * messages/{locale}/billing.json) — enough for a future error boundary to
 * look up, and still legible in server logs today.
 */
class BillingActionError extends Error {
  constructor(key: string) {
    super(`billing.errors.${key}`);
    this.name = "BillingActionError";
  }
}

export async function createCheckoutSessionAction(formData: FormData) {
  const { locale, orgSlug, planId } = scope.parse({
    locale: formData.get("locale"),
    orgSlug: formData.get("orgSlug"),
    planId: formData.get("planId"),
  });

  const ctx = await requireOrgContext(locale, orgSlug);
  assertCan(ctx, "settings", "manage");

  if (!isStripeConfigured()) {
    throw new BillingActionError("notConfigured");
  }
  if (!isBillablePlanId(planId)) {
    throw new BillingActionError("invalidPlan");
  }
  const priceId = getPlanPriceId(planId);
  if (!priceId) {
    throw new BillingActionError("priceNotConfigured");
  }

  const customerId = await ensureStripeCustomer(ctx);
  const stripe = getStripeClient();

  const planPageUrl = `${process.env.NEXT_PUBLIC_APP_URL}/${locale}/o/${orgSlug}/settings/plan`;

  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { orgId: ctx.org.id, planId },
    subscription_data: {
      metadata: { orgId: ctx.org.id, planId },
    },
    success_url: `${planPageUrl}?upgraded=1`,
    cancel_url: planPageUrl,
  });

  await audit(ctx, "billing.checkout_started", {
    entity: "org_subscription",
    entityId: ctx.org.id,
    meta: { planId },
  });

  if (!session.url) {
    throw new BillingActionError("checkoutSessionFailed");
  }
  redirect(session.url);
}

export async function createPortalSessionAction(formData: FormData) {
  const { locale, orgSlug } = scope
    .pick({ locale: true, orgSlug: true })
    .parse({
      locale: formData.get("locale"),
      orgSlug: formData.get("orgSlug"),
    });

  const ctx = await requireOrgContext(locale, orgSlug);
  assertCan(ctx, "settings", "manage");

  if (!isStripeConfigured()) {
    throw new BillingActionError("notConfigured");
  }

  const [row] = await withOrgRls(ctx.org.id, (tx) =>
    tx
      .select({ stripeCustomerId: orgSubscriptions.stripeCustomerId })
      .from(orgSubscriptions)
      .where(eq(orgSubscriptions.orgId, ctx.org.id))
      .limit(1),
  );

  if (!row?.stripeCustomerId) {
    throw new BillingActionError("noCustomer");
  }

  const stripe = getStripeClient();
  const planPageUrl = `${process.env.NEXT_PUBLIC_APP_URL}/${locale}/o/${orgSlug}/settings/plan`;

  const session = await stripe.billingPortal.sessions.create({
    customer: row.stripeCustomerId,
    return_url: planPageUrl,
  });

  await audit(ctx, "billing.portal_opened", {
    entity: "org_subscription",
    entityId: ctx.org.id,
  });

  redirect(session.url);
}
