import Stripe from "stripe";

/**
 * Maps our plan ids to the env var that holds the Stripe Price id for that
 * plan's monthly subscription. Kept as a single source of truth so the
 * checkout action, the webhook (price → plan matching), and any future
 * tooling agree on the mapping.
 */
export const PLAN_PRICE_ENV = {
  semilla: "STRIPE_PRICE_SEMILLA",
  cultivo: "STRIPE_PRICE_CULTIVO",
  cosecha: "STRIPE_PRICE_COSECHA",
} as const;

export type BillablePlanId = keyof typeof PLAN_PRICE_ENV;

export function isBillablePlanId(value: string): value is BillablePlanId {
  return value in PLAN_PRICE_ENV;
}

/** Reads the configured Stripe price id for a plan, or undefined if unset. */
export function getPlanPriceId(planId: BillablePlanId): string | undefined {
  return process.env[PLAN_PRICE_ENV[planId]] || undefined;
}

/**
 * STRIPE_SECRET_KEY presence is our single "is billing turned on" switch.
 * Every other Stripe-dependent surface (checkout/portal actions, webhook,
 * plan page upgrade buttons) gates on this so the app works fully without
 * Stripe env vars configured (e.g. local dev, demo envs).
 */
export function isStripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}

let cachedClient: Stripe | null = null;

/**
 * Lazily instantiated Stripe client. NEVER instantiate `new Stripe(...)` at
 * module scope — that would throw at import time (crashing the whole app,
 * including pages that never touch billing) whenever STRIPE_SECRET_KEY is
 * unset. Callers must check `isStripeConfigured()` (or catch the throw
 * below) before calling this.
 */
export function getStripeClient(): Stripe {
  if (cachedClient) return cachedClient;
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new Error("Stripe is not configured (missing STRIPE_SECRET_KEY)");
  }
  cachedClient = new Stripe(key);
  return cachedClient;
}

let cachedVerifier: Stripe | null = null;

/**
 * Webhook signature verification needs only STRIPE_WEBHOOK_SECRET, not the
 * API key — constructEvent is pure HMAC. A placeholder key keeps the SDK
 * happy without implying API access, so the webhook state machine remains
 * fully testable (and functional) with the signing secret alone.
 */
export function getWebhookVerifier(): Stripe {
  if (process.env.STRIPE_SECRET_KEY) return getStripeClient();
  cachedVerifier ??= new Stripe("sk_webhook_verification_only");
  return cachedVerifier;
}
