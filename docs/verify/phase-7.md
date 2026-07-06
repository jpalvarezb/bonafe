# Phase 7 verification — Billing & hardening

Setup as in phase-1.md. Stripe is OPTIONAL: without STRIPE_SECRET_KEY the plan
page keeps disabled upgrade buttons and everything else works.

## Webhook state machine (no Stripe account needed)

Uses the local signing secret from .env (`whsec_local_test_secret_agropeq`).

1. `node <scratchpad>/stripe-webhook-test.mjs` against `pnpm dev`:
   - bad signature → 400, nothing recorded
   - `checkout.session.completed` (org_vecino_sa → cultivo) → 200; vecino-sa
     subscription becomes **cultivo / active**; workers/payroll pages unlock.
   - exact REPLAY of the same event id → 200 `duplicate: true`; DB unchanged
     (`SELECT count(*) FROM stripe_events;` unchanged on replay).
   - `customer.subscription.updated` status past_due → vecino-sa shows the
     read-only banner on the plan page.
2. **Read-only degradation** (past_due): every mutation is refused
   server-side — creating a farm/activity/worker/sale throws
   "organization is read-only"; viewing keeps working; Settings → Plan
   remains reachable so billing can be fixed. Offline sync items are
   rejected (not lost: they land in the sync-issues tray).
3. Re-run with `--reactivate` → status active again; mutations work; audit
   trail (Settings → Auditoría) shows the billing.subscription_updated rows.

## Real Stripe (test mode, when keys are configured)

4. Set STRIPE_SECRET_KEY/WEBHOOK_SECRET/PRICE_* → plan page shows "Cambiar a
   Cultivo/Cosecha" buttons → Checkout (4242 4242 4242 4242) → redirected
   back with the success banner; plan unlocks instantly on webhook receipt.
   "Administrar facturación" opens the customer portal.

## Audit log

5. Settings → Auditoría (owners/admins only; managers get redirected):
   member invites, work-order transitions, payroll close, sales/purchases
   create/delete, worker changes, exchange-rate sets, imports, transfers and
   billing events all appear with actor, time, and context; `?action=sale.`
   filters. Field supervisor cannot open the page.

## Rate limiting & headers

6. `for i in $(seq 40); do curl -s -o /dev/null -w "%{http_code}\n" -X POST \
   localhost:3000/api/sync -H 'content-type: application/json' -d '{}'; done`
   → 400s then 429 after 30/min for an authenticated user (raw curl without a
   session sees 401 — the limiter is per-user beyond auth).
7. `curl -sI localhost:3000/es/login | grep -iE "x-frame|nosniff|referrer"` →
   DENY / nosniff / strict-origin-when-cross-origin.
8. Better Auth endpoints rate-limit repeated sign-in attempts (60/min window,
   stricter built-ins on sign-in).

## Automated

`pnpm test` · `pnpm typecheck` · `pnpm build` — green at Phase 7 close.
RLS remains deferred (documented decision: app-layer org scoping is enforced
at the service layer and re-audited every phase by the Opus review).
